//! ce_dedup — Contained Evolution's owned perceptual image-dedup engine.
//!
//! FILE INDEX
//!   Public API:
//!     scan(root, threshold)            — walk a dir, hash every image, return a ScanReport of duplicate groups
//!     dhash(&DynamicImage) -> ImageHash — 64-bit difference-hash (perceptual; survives resize + recompression)
//!     group(&[ScannedImage], threshold) — cluster hashed images into DuplicateGroups (BK-tree + union-find)
//!     hash_images(&[PathBuf])           — parallel decode+hash (one std thread per CPU)
//!     collect_images(root, &mut out)    — recursive image-file walk (skips symlinked dirs => no cycles)
//!     DEFAULT_THRESHOLD                 — hamming cutoff for "same photo" (10)
//!   Types: ImageHash · ScannedImage · DuplicateGroup · DuplicateMember · ScanReport
//!
//! WHY dHash: resize to 9x8 grayscale, compare horizontally-adjacent pixels ->
//! 64 bits. Identical/recompressed/resized copies of one photo land within a
//! few bits of each other (small hamming distance); unrelated photos are far
//! apart. Same family of algorithm Czkawka uses — except this is CE code.
//!
//! NOTES / connections:
//!   - Embedded by ../../src-tauri/src/main.rs as the `scan_duplicates` command.
//!   - Foreign code is decode-only (`image`, MIT). Grouping is O(n log n)-ish
//!     via a BK-tree so a terabyte library doesn't become O(n^2).
//!   - HEIC (iPhone) is NOT decodable here — pure-Rust `image` omits it. Such
//!     files are silently skipped (counted in ScanReport.decode_errors). A
//!     libheif-backed add-on is the documented later step, not a quiet gap.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use image::imageops::FilterType;
use image::DynamicImage;
use serde::Serialize;

/// Hamming cutoff treating two images as the same photo. dHash distance <=10 is
/// the well-worn "near-identical" band for resized/recompressed copies.
pub const DEFAULT_THRESHOLD: u32 = 10;

/// 8x8 comparison grid -> 64-bit hash. Resize target is (SIDE+1) x SIDE.
const SIDE: u32 = 8;

const IMAGE_EXTS: &[&str] = &["jpg", "jpeg", "png", "gif", "bmp", "tif", "tiff", "webp"];

/// A 64-bit perceptual difference-hash.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ImageHash(pub u64);

impl ImageHash {
    /// Number of differing bits — the perceptual "distance" between two images.
    #[inline]
    pub fn hamming(self, other: ImageHash) -> u32 {
        (self.0 ^ other.0).count_ones()
    }
}

/// GPS position pulled from EXIF (decimal degrees; negative = S / W).
#[derive(Clone, Serialize, Default)]
pub struct Gps {
    pub lat: f64,
    pub lon: f64,
}

/// Per-image metadata for the ⓘ panel and the categorize-by-metadata views.
/// `has_exif` distinguishes real camera photos from stripped copies/screenshots.
#[derive(Clone, Serialize, Default)]
pub struct Metadata {
    pub has_exif: bool,
    /// DateTimeOriginal as "YYYY-MM-DD HH:MM:SS" when present.
    pub taken: Option<String>,
    pub year: Option<i32>,
    pub month: Option<u32>,
    /// "Make Model" (trimmed) when present.
    pub camera: Option<String>,
    pub gps: Option<Gps>,
    pub width: Option<u32>,
    pub height: Option<u32>,
}

/// One image after decode+hash. `hash` is internal (not serialized to the UI).
#[derive(Clone, Serialize)]
pub struct ScannedImage {
    pub path: PathBuf,
    pub size_bytes: u64,
    #[serde(skip)]
    pub hash: ImageHash,
    pub meta: Metadata,
}

/// A duplicate member: keep the keeper, this one is recommended for removal.
#[derive(Serialize)]
pub struct DuplicateMember {
    pub path: PathBuf,
    pub size_bytes: u64,
    /// Hamming distance from the group's keeper (0 = pixel-identical hash).
    pub distance: u32,
}

/// A cluster of the same photo. Keeper = the largest file (highest fidelity).
#[derive(Serialize)]
pub struct DuplicateGroup {
    pub keeper: PathBuf,
    pub keeper_size_bytes: u64,
    pub duplicates: Vec<DuplicateMember>,
}

/// The full result of a scan.
#[derive(Serialize, Default)]
pub struct ScanReport {
    pub root: PathBuf,
    /// Image files found by extension (before decode).
    pub files_found: usize,
    /// Files successfully decoded + hashed.
    pub images_scanned: usize,
    /// Files that failed to decode (corrupt, unsupported e.g. HEIC, or unreadable).
    pub decode_errors: usize,
    pub groups: Vec<DuplicateGroup>,
    /// Bytes you'd reclaim by deleting every duplicate (keeping each keeper).
    pub reclaimable_bytes: u64,
    /// Every successfully scanned image with its metadata — powers the ⓘ panel
    /// and the categorize-by-metadata (date / camera / location / EXIF) views.
    pub images: Vec<ScannedImage>,
}

/// Compute the dHash of an already-decoded image.
pub fn dhash(img: &DynamicImage) -> ImageHash {
    // (SIDE+1) wide so each row yields SIDE horizontal comparisons.
    let small = img
        .resize_exact(SIDE + 1, SIDE, FilterType::Triangle)
        .to_luma8();
    let mut bits: u64 = 0;
    let mut idx = 0u32;
    for y in 0..SIDE {
        for x in 0..SIDE {
            let left = small.get_pixel(x, y)[0];
            let right = small.get_pixel(x + 1, y)[0];
            if left > right {
                bits |= 1u64 << idx;
            }
            idx += 1;
        }
    }
    ImageHash(bits)
}

fn is_image(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| IMAGE_EXTS.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

/// Heuristic "does this name look like a generated copy rather than the
/// original?" — 0 = original-looking, higher = more copy-like. Used ONLY to
/// break keeper ties when fidelity (file size) is equal, so we don't keep
/// "IMG_0001 (1).jpg" over the original "IMG_0001.jpg".
fn copy_rank(path: &Path) -> u8 {
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    // Trailing parenthesised number — Windows' duplicate tag: "name (1)".
    if stem.ends_with(')') {
        if let Some(open) = stem.rfind('(') {
            let inner = &stem[open + 1..stem.len() - 1];
            if !inner.is_empty() && inner.bytes().all(|b| b.is_ascii_digit()) {
                return 2;
            }
        }
    }
    // "name - copy", "copy of name", "name_copy", …
    if stem.contains("copy") {
        return 1;
    }
    0
}

/// Recursively collect image-file paths under `root`. Per-directory IO errors
/// are skipped (a permission-denied subfolder shouldn't abort the whole scan);
/// symlinked dirs are NOT descended (file_type() doesn't follow symlinks) so
/// the walk can't loop.
pub fn collect_images(root: &Path, out: &mut Vec<PathBuf>) {
    let entries = match std::fs::read_dir(root) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        match entry.file_type() {
            Ok(ft) if ft.is_dir() => collect_images(&path, out),
            Ok(ft) if ft.is_file() && is_image(&path) => out.push(path),
            _ => {}
        }
    }
}

/// "Metadata richness" — used to pick the keeper: a stripped copy scores lower
/// than the EXIF-bearing original, so the original survives even on a size tie.
fn meta_score(m: &Metadata) -> u8 {
    m.has_exif as u8
        + m.taken.is_some() as u8
        + m.camera.is_some() as u8
        + m.gps.is_some() as u8
}

fn gps_coord(exif: &exif::Exif, tag: exif::Tag) -> Option<f64> {
    let f = exif.get_field(tag, exif::In::PRIMARY)?;
    if let exif::Value::Rational(ref r) = f.value {
        if r.len() >= 3 {
            return Some(r[0].to_f64() + r[1].to_f64() / 60.0 + r[2].to_f64() / 3600.0);
        }
    }
    None
}

fn gps_ref(exif: &exif::Exif, tag: exif::Tag) -> Option<char> {
    let f = exif.get_field(tag, exif::In::PRIMARY)?;
    if let exif::Value::Ascii(ref v) = f.value {
        return v.first().and_then(|s| s.first()).map(|&b| b as char);
    }
    None
}

fn read_gps(exif: &exif::Exif) -> Option<Gps> {
    let lat = gps_coord(exif, exif::Tag::GPSLatitude)?;
    let lon = gps_coord(exif, exif::Tag::GPSLongitude)?;
    let lat = if gps_ref(exif, exif::Tag::GPSLatitudeRef) == Some('S') { -lat } else { lat };
    let lon = if gps_ref(exif, exif::Tag::GPSLongitudeRef) == Some('W') { -lon } else { lon };
    Some(Gps { lat, lon })
}

/// Read EXIF (capture date, camera, GPS) for a file. Absent/unreadable EXIF —
/// the common case for screenshots, Facebook downloads and re-saves — yields
/// `has_exif: false`, which is itself a category.
fn read_metadata(path: &Path, width: u32, height: u32) -> Metadata {
    let mut meta = Metadata {
        width: Some(width),
        height: Some(height),
        ..Metadata::default()
    };
    let Ok(file) = std::fs::File::open(path) else { return meta };
    let mut buf = std::io::BufReader::new(file);
    let Ok(exif) = exif::Reader::new().read_from_container(&mut buf) else { return meta };
    meta.has_exif = true;

    if let Some(f) = exif.get_field(exif::Tag::DateTimeOriginal, exif::In::PRIMARY) {
        // display_value renders DateTime as "YYYY-MM-DD HH:MM:SS".
        let s = f.display_value().to_string();
        meta.year = s.get(0..4).and_then(|y| y.parse().ok());
        meta.month = s.get(5..7).and_then(|m| m.parse().ok());
        meta.taken = Some(s);
    }
    let make = exif
        .get_field(exif::Tag::Make, exif::In::PRIMARY)
        .map(|f| f.display_value().to_string().trim().trim_matches('"').to_string());
    let model = exif
        .get_field(exif::Tag::Model, exif::In::PRIMARY)
        .map(|f| f.display_value().to_string().trim().trim_matches('"').to_string());
    meta.camera = match (make, model) {
        (Some(mk), Some(md)) if !md.is_empty() && md.starts_with(&mk) => Some(md),
        (Some(mk), Some(md)) if !md.is_empty() => Some(format!("{mk} {md}")),
        (Some(mk), _) if !mk.is_empty() => Some(mk),
        (_, Some(md)) if !md.is_empty() => Some(md),
        _ => None,
    };
    meta.gps = read_gps(&exif);
    meta
}

fn process_one(path: &Path) -> Option<ScannedImage> {
    let size_bytes = std::fs::metadata(path).ok()?.len();
    let img = image::open(path).ok()?;
    let (w, h) = (img.width(), img.height());
    let hash = dhash(&img);
    Some(ScannedImage {
        path: path.to_path_buf(),
        size_bytes,
        hash,
        meta: read_metadata(path, w, h),
    })
}

/// Decode + hash every path, one std thread per CPU. Returns the successfully
/// hashed images and the count that failed to decode. Decode is the bottleneck
/// and embarrassingly parallel — this is where the "speed" lives.
pub fn hash_images(paths: &[PathBuf]) -> (Vec<ScannedImage>, usize) {
    if paths.is_empty() {
        return (Vec::new(), 0);
    }
    let n_threads = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4);
    let chunk = paths.len().div_ceil(n_threads).max(1);

    let mut images = Vec::with_capacity(paths.len());
    let mut errors = 0usize;
    std::thread::scope(|s| {
        let handles: Vec<_> = paths
            .chunks(chunk)
            .map(|c| {
                s.spawn(move || {
                    let mut local = Vec::new();
                    let mut errs = 0usize;
                    for p in c {
                        match process_one(p) {
                            Some(si) => local.push(si),
                            None => errs += 1,
                        }
                    }
                    (local, errs)
                })
            })
            .collect();
        for h in handles {
            let (local, errs) = h.join().expect("hash worker panicked");
            images.extend(local);
            errors += errs;
        }
    });
    (images, errors)
}

// ── Disjoint-set (union-find) for transitive clustering ──────────────────────
struct UnionFind {
    parent: Vec<usize>,
    rank: Vec<u8>,
}
impl UnionFind {
    fn new(n: usize) -> Self {
        UnionFind {
            parent: (0..n).collect(),
            rank: vec![0; n],
        }
    }
    fn find(&mut self, mut x: usize) -> usize {
        while self.parent[x] != x {
            self.parent[x] = self.parent[self.parent[x]]; // path halving
            x = self.parent[x];
        }
        x
    }
    fn union(&mut self, a: usize, b: usize) {
        let (ra, rb) = (self.find(a), self.find(b));
        if ra == rb {
            return;
        }
        if self.rank[ra] < self.rank[rb] {
            self.parent[ra] = rb;
        } else if self.rank[ra] > self.rank[rb] {
            self.parent[rb] = ra;
        } else {
            self.parent[rb] = ra;
            self.rank[ra] += 1;
        }
    }
}

// ── BK-tree: hamming-metric index for sub-linear near-neighbour search ───────
// Arena-backed (Vec of nodes) to dodge recursive ownership; each node maps an
// exact distance -> child node index.
struct BkNode {
    hash: u64,
    img_index: usize,
    children: HashMap<u32, usize>,
}
struct BkTree {
    nodes: Vec<BkNode>,
}
impl BkTree {
    fn new() -> Self {
        BkTree { nodes: Vec::new() }
    }
    fn insert(&mut self, img_index: usize, hash: u64) {
        if self.nodes.is_empty() {
            self.nodes.push(BkNode { hash, img_index, children: HashMap::new() });
            return;
        }
        let mut cur = 0usize;
        loop {
            let d = (self.nodes[cur].hash ^ hash).count_ones();
            match self.nodes[cur].children.get(&d) {
                Some(&child) => cur = child,
                None => {
                    let new = self.nodes.len();
                    self.nodes.push(BkNode { hash, img_index, children: HashMap::new() });
                    self.nodes[cur].children.insert(d, new);
                    return;
                }
            }
        }
    }
    /// Push the img_index of every inserted node within `t` bits of `hash`.
    fn query(&self, hash: u64, t: u32, out: &mut Vec<usize>) {
        if self.nodes.is_empty() {
            return;
        }
        let mut stack = vec![0usize];
        while let Some(cur) = stack.pop() {
            let node = &self.nodes[cur];
            let d = (node.hash ^ hash).count_ones();
            if d <= t {
                out.push(node.img_index);
            }
            let lo = d.saturating_sub(t);
            let hi = d + t;
            for (&dist, &child) in &node.children {
                if dist >= lo && dist <= hi {
                    stack.push(child);
                }
            }
        }
    }
}

/// Cluster hashed images into duplicate groups. Builds a BK-tree incrementally;
/// each image unions with any already-seen neighbour within `threshold`, so
/// A~B and B~C land in one group (transitive). Keeper = largest file.
pub fn group(images: &[ScannedImage], threshold: u32) -> Vec<DuplicateGroup> {
    let mut uf = UnionFind::new(images.len());
    let mut tree = BkTree::new();
    let mut neighbours = Vec::new();
    for (i, img) in images.iter().enumerate() {
        neighbours.clear();
        tree.query(img.hash.0, threshold, &mut neighbours);
        for &j in &neighbours {
            uf.union(i, j);
        }
        tree.insert(i, img.hash.0);
    }

    // Bucket indices by their union-find root.
    let mut buckets: HashMap<usize, Vec<usize>> = HashMap::new();
    for i in 0..images.len() {
        let root = uf.find(i);
        buckets.entry(root).or_default().push(i);
    }

    let mut groups = Vec::new();
    for members in buckets.into_values() {
        if members.len() < 2 {
            continue; // singletons aren't duplicates
        }
        // Keeper priority: richer EXIF (the real original, not a stripped copy)
        // → larger file (fidelity) → most original-looking name (beats "(1)") →
        // shorter → stable path order.
        let keeper_idx = *members
            .iter()
            .max_by(|&&a, &&b| {
                let (ia, ib) = (&images[a], &images[b]);
                meta_score(&ia.meta)
                    .cmp(&meta_score(&ib.meta))
                    .then_with(|| ia.size_bytes.cmp(&ib.size_bytes))
                    .then_with(|| copy_rank(&ib.path).cmp(&copy_rank(&ia.path)))
                    .then_with(|| ib.path.as_os_str().len().cmp(&ia.path.as_os_str().len()))
                    .then_with(|| ib.path.cmp(&ia.path))
            })
            .unwrap();
        let keeper = &images[keeper_idx];
        let mut duplicates: Vec<DuplicateMember> = members
            .iter()
            .filter(|&&m| m != keeper_idx)
            .map(|&m| DuplicateMember {
                path: images[m].path.clone(),
                size_bytes: images[m].size_bytes,
                distance: keeper.hash.hamming(images[m].hash),
            })
            .collect();
        duplicates.sort_by(|a, b| a.distance.cmp(&b.distance).then_with(|| a.path.cmp(&b.path)));
        groups.push(DuplicateGroup {
            keeper: keeper.path.clone(),
            keeper_size_bytes: keeper.size_bytes,
            duplicates,
        });
    }
    // Biggest reclaim first.
    groups.sort_by(|a, b| {
        let ra: u64 = b.duplicates.iter().map(|d| d.size_bytes).sum();
        let rb: u64 = a.duplicates.iter().map(|d| d.size_bytes).sum();
        ra.cmp(&rb).then_with(|| a.keeper.cmp(&b.keeper))
    });
    groups
}

/// Walk `root`, hash every image in parallel, and return the duplicate report.
pub fn scan(root: &Path, threshold: u32) -> std::io::Result<ScanReport> {
    if !root.is_dir() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("not a directory: {}", root.display()),
        ));
    }
    let mut paths = Vec::new();
    collect_images(root, &mut paths);
    let files_found = paths.len();
    let (images, decode_errors) = hash_images(&paths);
    let groups = group(&images, threshold);
    let reclaimable_bytes = groups
        .iter()
        .flat_map(|g| g.duplicates.iter())
        .map(|d| d.size_bytes)
        .sum();
    Ok(ScanReport {
        root: root.to_path_buf(),
        files_found,
        images_scanned: images.len(),
        decode_errors,
        groups,
        reclaimable_bytes,
        images,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{DynamicImage, GenericImage, Rgba};

    /// A deterministic test image: diagonal gradient + a seeded block so each
    /// `seed` is visually distinct.
    fn make_image(w: u32, h: u32, seed: u8) -> DynamicImage {
        let mut img = DynamicImage::new_rgb8(w, h);
        for y in 0..h {
            for x in 0..w {
                let v = (((x + y) * 3) as u8).wrapping_add(seed.wrapping_mul(37));
                img.put_pixel(x, y, Rgba([v, v.wrapping_add(seed), v ^ seed, 255]));
            }
        }
        img
    }

    /// ScannedImage with default (empty) metadata — for grouping tests.
    fn si(path: &str, size: u64, hash: u64) -> ScannedImage {
        ScannedImage { path: path.into(), size_bytes: size, hash: ImageHash(hash), meta: Metadata::default() }
    }

    #[test]
    fn resized_copy_is_near() {
        let original = make_image(256, 256, 1);
        // Simulate a recompressed/resized copy: down then back up.
        let shrunk = original.resize_exact(96, 96, FilterType::Triangle);
        let h_orig = dhash(&original);
        let h_copy = dhash(&shrunk);
        assert!(
            h_orig.hamming(h_copy) <= DEFAULT_THRESHOLD,
            "resized copy should be within threshold, got {}",
            h_orig.hamming(h_copy)
        );
    }

    #[test]
    fn different_images_are_far() {
        let a = make_image(256, 256, 1);
        let b = make_image(256, 256, 200);
        assert!(
            dhash(&a).hamming(dhash(&b)) > DEFAULT_THRESHOLD,
            "distinct images should exceed threshold"
        );
    }

    #[test]
    fn grouping_is_transitive_and_keeps_largest() {
        // Three "copies" of one photo with slightly perturbed hashes (<=2 bits
        // apart pairwise), plus one unrelated image far away.
        let imgs = vec![
            si("small.jpg", 100, 0b0000),
            si("mid.jpg", 500, 0b0001),
            si("big.png", 900, 0b0011),
            si("other.jpg", 700, u64::MAX),
        ];
        let groups = group(&imgs, 2);
        assert_eq!(groups.len(), 1, "the three near copies form exactly one group");
        let g = &groups[0];
        assert_eq!(g.keeper.to_str().unwrap(), "big.png", "largest file is the keeper");
        assert_eq!(g.duplicates.len(), 2);
        // 'other' (max distance) must not be pulled in.
        assert!(g.duplicates.iter().all(|d| d.path.to_str().unwrap() != "other.jpg"));
    }

    #[test]
    fn keeper_prefers_original_over_windows_copy_on_tie() {
        // Identical-size copies; the "(1)" one is the generated copy.
        let imgs = vec![si("IMG_0001 (1).jpg", 500, 0), si("IMG_0001.jpg", 500, 0)];
        let groups = group(&imgs, 0);
        assert_eq!(groups.len(), 1);
        assert_eq!(
            groups[0].keeper.to_str().unwrap(),
            "IMG_0001.jpg",
            "the original (no '(1)') should be the keeper"
        );
    }

    #[test]
    fn keeper_prefers_exif_rich_over_stripped() {
        // Same size + same name shape, but one still has camera EXIF — keep it,
        // even though the stripped one would win on the name/order tiebreak.
        let mut rich = si("a.jpg", 500, 0);
        rich.meta.has_exif = true;
        rich.meta.taken = Some("2015-09-02 22:19:53".into());
        let stripped = si("b.jpg", 500, 0); // earlier in path order, no EXIF
        let groups = group(&[stripped, rich], 0);
        assert_eq!(groups.len(), 1);
        assert_eq!(
            groups[0].keeper.to_str().unwrap(),
            "a.jpg",
            "the EXIF-bearing original should be kept over the stripped copy"
        );
    }

    #[test]
    fn no_false_groups_for_unique_images() {
        let imgs = vec![
            si("a", 1, 0x0000_0000_0000_0000),
            si("b", 1, 0xFFFF_FFFF_FFFF_FFFF),
            si("c", 1, 0x0F0F_0F0F_0F0F_0F0F),
        ];
        assert!(group(&imgs, DEFAULT_THRESHOLD).is_empty());
    }
}
