//! ce-dedup — standalone CLI for the CE perceptual image-dedup engine.
//!
//! FILE INDEX
//!   main()        — parse args, run ce_dedup::scan, print human or --json report
//!   parse_args()  — <dir> [--threshold N] [--json]; returns (root, threshold, json)
//!   human_report()— pretty terminal summary of a ScanReport
//!   human_bytes() — bytes -> "1.2 GB"
//!
//! NOTES: this is the no-app entry point — proves the engine works on a real
//! folder without the Tauri shell. The shell calls the same ce_dedup::scan.
//! Usage:  ce-dedup "C:\\path\\to\\photos" [--threshold 10] [--json]

use std::path::PathBuf;
use std::process::ExitCode;

use ce_dedup::{scan, ScanReport, DEFAULT_THRESHOLD};

fn main() -> ExitCode {
    let (root, threshold, json) = match parse_args() {
        Ok(v) => v,
        Err(msg) => {
            eprintln!("{msg}");
            eprintln!("usage: ce-dedup <directory> [--threshold N] [--json]");
            return ExitCode::from(2);
        }
    };

    let report = match scan(&root, threshold) {
        Ok(r) => r,
        Err(e) => {
            eprintln!("scan failed: {e}");
            return ExitCode::FAILURE;
        }
    };

    if json {
        match serde_json::to_string_pretty(&report) {
            Ok(s) => println!("{s}"),
            Err(e) => {
                eprintln!("serialize failed: {e}");
                return ExitCode::FAILURE;
            }
        }
    } else {
        human_report(&report);
    }
    ExitCode::SUCCESS
}

fn parse_args() -> Result<(PathBuf, u32, bool), String> {
    let mut root: Option<PathBuf> = None;
    let mut threshold = DEFAULT_THRESHOLD;
    let mut json = false;

    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--json" => json = true,
            "--threshold" => {
                let v = args.next().ok_or("--threshold needs a number")?;
                threshold = v.parse().map_err(|_| format!("bad --threshold: {v}"))?;
            }
            "-h" | "--help" => return Err("ce-dedup — find duplicate/near-duplicate photos".into()),
            other if other.starts_with('-') => return Err(format!("unknown flag: {other}")),
            other => {
                if root.is_some() {
                    return Err("only one directory may be given".into());
                }
                root = Some(PathBuf::from(other));
            }
        }
    }
    let root = root.ok_or("a directory is required")?;
    Ok((root, threshold, json))
}

fn human_bytes(b: u64) -> String {
    const UNITS: &[&str] = &["B", "KB", "MB", "GB", "TB"];
    let mut v = b as f64;
    let mut u = 0;
    while v >= 1024.0 && u < UNITS.len() - 1 {
        v /= 1024.0;
        u += 1;
    }
    if u == 0 {
        format!("{b} B")
    } else {
        format!("{v:.1} {}", UNITS[u])
    }
}

fn human_report(r: &ScanReport) {
    println!("Scanned: {}", r.root.display());
    println!(
        "  {} image files found · {} hashed · {} skipped (corrupt/unsupported, e.g. HEIC)",
        r.files_found, r.images_scanned, r.decode_errors
    );
    println!(
        "  {} duplicate group(s) · {} reclaimable\n",
        r.groups.len(),
        human_bytes(r.reclaimable_bytes)
    );
    for (i, g) in r.groups.iter().enumerate() {
        println!(
            "[{}] KEEP  {}  ({})",
            i + 1,
            g.keeper.display(),
            human_bytes(g.keeper_size_bytes)
        );
        for d in &g.duplicates {
            println!(
                "      dup   {}  ({}, {} bits)",
                d.path.display(),
                human_bytes(d.size_bytes),
                d.distance
            );
        }
    }
    if r.groups.is_empty() {
        println!("No duplicates found.");
    }
}
