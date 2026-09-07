//! Private Windows native-desk driver.
//!
//! This module is deliberately not a Tauri command. Its registry records,
//! bridge context, verified HWND tokens, and mutation methods are private to
//! trusted native code. The production Rust-to-Node port remains disconnected.

#![allow(dead_code)]

use std::path::{Component, Path, PathBuf};
use std::sync::Arc;

#[derive(Clone, Debug, PartialEq, Eq)]
struct RegisteredWindowsClient {
    client_id: String,
    package_family_name: String,
    application_user_model_id: String,
    relative_executables: Vec<String>,
    window_classes: Vec<String>,
}

impl RegisteredWindowsClient {
    fn from_registry(
        client_id: &str,
        package_family_name: &str,
        application_user_model_id: &str,
        relative_executables: &[&str],
        window_classes: &[&str],
    ) -> Result<Self, String> {
        if client_id.is_empty()
            || package_family_name.is_empty()
            || !application_user_model_id.starts_with(&format!("{package_family_name}!"))
            || relative_executables.is_empty()
            || window_classes.is_empty()
        {
            return Err("Invalid registry-resolved Windows client identity.".into());
        }
        let executables = relative_executables
            .iter()
            .map(|value| normalize_relative(value))
            .collect::<Result<Vec<_>, _>>()?;
        let classes = window_classes
            .iter()
            .map(|value| {
                if value.is_empty() || value.chars().any(|ch| ".*+?^${}()|[]\\".contains(ch)) {
                    Err("Window classes must be exact values.".to_string())
                } else {
                    Ok((*value).to_string())
                }
            })
            .collect::<Result<Vec<_>, _>>()?;
        Ok(Self {
            client_id: client_id.to_string(),
            package_family_name: package_family_name.to_string(),
            application_user_model_id: application_user_model_id.to_string(),
            relative_executables: executables,
            window_classes: classes,
        })
    }
}

fn normalize_relative(value: &str) -> Result<String, String> {
    let path = Path::new(value);
    if value.is_empty()
        || path.is_absolute()
        || path
            .components()
            .any(|part| !matches!(part, Component::Normal(_)))
        || value.contains(':')
    {
        return Err("Windows executable must be package-relative.".into());
    }
    Ok(value.replace('/', "\\").to_ascii_lowercase())
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct PhysicalRect {
    x: i32,
    y: i32,
    width: i32,
    height: i32,
}

impl PhysicalRect {
    fn checked(x: i32, y: i32, width: i32, height: i32) -> Result<Self, String> {
        if width < 320
            || height < 320
            || [x, y, width, height]
                .iter()
                .any(|value| value.unsigned_abs() > 100_000)
        {
            return Err("Invalid trusted native-desk geometry.".into());
        }
        Ok(Self {
            x,
            y,
            width,
            height,
        })
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct WindowPlacement {
    flags: u32,
    show_command: u32,
    min_position: (i32, i32),
    max_position: (i32, i32),
    normal: PhysicalRect,
}

#[derive(Clone, Debug)]
struct RawWindow {
    hwnd: isize,
    root_hwnd: isize,
    owner_hwnd: Option<isize>,
    pid: u32,
    process_start_time: u64,
    package_family_name: String,
    application_user_model_id: String,
    package_full_name: String,
    package_install_root: PathBuf,
    process_executable: PathBuf,
    relative_executable: String,
    window_class: String,
    visible: bool,
    iconic: bool,
    cloaked: bool,
    tool_window: bool,
    elevated: bool,
    on_current_desktop: bool,
    bounds: PhysicalRect,
    dpi: u32,
    focused: bool,
    placement: WindowPlacement,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct WindowToken {
    hwnd: isize,
    pid: u32,
    process_start_time: u64,
    package_family_name: String,
    application_user_model_id: String,
    package_full_name: String,
    relative_executable: String,
    window_class: String,
}

#[derive(Clone, Debug)]
struct VerifiedWindow {
    client: RegisteredWindowsClient,
    token: WindowToken,
    raw: RawWindow,
}

trait WindowsOs {
    fn enumerate(&self) -> Result<Vec<RawWindow>, String>;
    fn application_found(&self, client: &RegisteredWindowsClient) -> Result<bool, String>;
    fn activate(&self, client: &RegisteredWindowsClient) -> Result<(), String>;
    fn minimize(&self, token: &WindowToken) -> Result<(), String>;
    fn restore(
        &self,
        token: &WindowToken,
        placement: Option<&WindowPlacement>,
    ) -> Result<(), String>;
    fn place(&self, token: &WindowToken, rect: PhysicalRect) -> Result<(), String>;
    fn focus(&self, token: &WindowToken) -> Result<(), String>;
}

#[derive(Clone)]
struct AuthenticatedBridgeContext {
    seal: Arc<()>,
}

struct WindowsNativeDriver<O: WindowsOs> {
    os: O,
    seal: Arc<()>,
}

impl<O: WindowsOs> WindowsNativeDriver<O> {
    fn bind(os: O) -> (Self, AuthenticatedBridgeContext) {
        let seal = Arc::new(());
        (
            Self {
                os,
                seal: seal.clone(),
            },
            AuthenticatedBridgeContext { seal },
        )
    }

    fn authenticate(&self, context: &AuthenticatedBridgeContext) -> Result<(), String> {
        if Arc::ptr_eq(&self.seal, &context.seal) {
            Ok(())
        } else {
            Err("Windows native-desk authority is absent or revoked.".into())
        }
    }

    fn inventory(
        &self,
        context: &AuthenticatedBridgeContext,
        client: &RegisteredWindowsClient,
    ) -> Result<Vec<VerifiedWindow>, String> {
        self.authenticate(context)?;
        self.os.enumerate().map(|windows| {
            windows
                .into_iter()
                .filter_map(|raw| verify_candidate(client, raw))
                .collect()
        })
    }

    fn one(
        &self,
        context: &AuthenticatedBridgeContext,
        client: &RegisteredWindowsClient,
    ) -> Result<VerifiedWindow, String> {
        let mut found = self.inventory(context, client)?;
        if found.len() != 1 {
            return Err("Exactly one verified native application window is required.".into());
        }
        Ok(found.remove(0))
    }

    fn revalidate(
        &self,
        context: &AuthenticatedBridgeContext,
        window: &VerifiedWindow,
    ) -> Result<VerifiedWindow, String> {
        self.inventory(context, &window.client)?
            .into_iter()
            .find(|current| current.token == window.token)
            .ok_or_else(|| "Windows process or HWND identity changed.".into())
    }

    fn application_found(
        &self,
        context: &AuthenticatedBridgeContext,
        client: &RegisteredWindowsClient,
    ) -> Result<bool, String> {
        self.authenticate(context)?;
        self.os.application_found(client)
    }

    fn activate(
        &self,
        context: &AuthenticatedBridgeContext,
        client: &RegisteredWindowsClient,
    ) -> Result<(), String> {
        self.authenticate(context)?;
        if !self.os.application_found(client)? {
            return Err("Registered packaged application is unavailable.".into());
        }
        self.os.activate(client)
    }

    fn minimize(
        &self,
        context: &AuthenticatedBridgeContext,
        window: &VerifiedWindow,
    ) -> Result<VerifiedWindow, String> {
        let before = self.revalidate(context, window)?;
        self.os.minimize(&before.token)?;
        let after = self.revalidate(context, &before)?;
        if !after.raw.iconic {
            return Err("Native minimize outcome is unverified.".into());
        }
        Ok(after)
    }

    fn restore(
        &self,
        context: &AuthenticatedBridgeContext,
        window: &VerifiedWindow,
        placement: Option<&WindowPlacement>,
    ) -> Result<VerifiedWindow, String> {
        let before = self.revalidate(context, window)?;
        self.os.restore(&before.token, placement)?;
        let after = self.revalidate(context, &before)?;
        if after.raw.iconic || !after.raw.visible {
            return Err("Native restore outcome is unverified.".into());
        }
        Ok(after)
    }

    fn place(
        &self,
        context: &AuthenticatedBridgeContext,
        window: &VerifiedWindow,
        rect: PhysicalRect,
    ) -> Result<VerifiedWindow, String> {
        let before = self.revalidate(context, window)?;
        self.os.place(&before.token, rect)?;
        let after = self.revalidate(context, &before)?;
        if after.raw.bounds != rect || after.raw.iconic || !after.raw.visible {
            return Err("Native placement outcome is unverified.".into());
        }
        Ok(after)
    }

    fn focus(
        &self,
        context: &AuthenticatedBridgeContext,
        window: &VerifiedWindow,
    ) -> Result<VerifiedWindow, String> {
        let before = self.revalidate(context, window)?;
        self.os.focus(&before.token)?;
        let after = self.revalidate(context, &before)?;
        if !after.raw.focused {
            return Err("Native focus outcome is unverified.".into());
        }
        Ok(after)
    }
}

fn verify_candidate(client: &RegisteredWindowsClient, raw: RawWindow) -> Option<VerifiedWindow> {
    let relative = relative_from_root(&raw.package_install_root, &raw.process_executable)?;
    let user_window = raw.hwnd != 0
        && raw.root_hwnd == raw.hwnd
        && raw.owner_hwnd.is_none()
        && !raw.tool_window
        && (raw.visible || raw.iconic)
        && (!raw.cloaked || raw.iconic)
        && !raw.elevated
        && raw.on_current_desktop
        && raw.bounds.width > 0
        && raw.bounds.height > 0
        && raw.dpi > 0;
    if !user_window
        || raw.package_family_name != client.package_family_name
        || raw.application_user_model_id != client.application_user_model_id
        || relative != raw.relative_executable
        || !client.relative_executables.contains(&relative)
        || !client.window_classes.contains(&raw.window_class)
    {
        return None;
    }
    let token = token_from_raw(&raw);
    Some(VerifiedWindow {
        client: client.clone(),
        token,
        raw,
    })
}

fn token_from_raw(raw: &RawWindow) -> WindowToken {
    WindowToken {
        hwnd: raw.hwnd,
        pid: raw.pid,
        process_start_time: raw.process_start_time,
        package_family_name: raw.package_family_name.clone(),
        application_user_model_id: raw.application_user_model_id.clone(),
        package_full_name: raw.package_full_name.clone(),
        relative_executable: raw.relative_executable.clone(),
        window_class: raw.window_class.clone(),
    }
}

fn relative_from_root(root: &Path, executable: &Path) -> Option<String> {
    let root_text = root.to_string_lossy().replace('/', "\\");
    let exe_text = executable.to_string_lossy().replace('/', "\\");
    let prefix = format!("{}\\", root_text.trim_end_matches('\\'));
    if exe_text.len() <= prefix.len() || !exe_text[..prefix.len()].eq_ignore_ascii_case(&prefix) {
        return None;
    }
    normalize_relative(&exe_text[prefix.len()..]).ok()
}

struct PortState {
    available: bool,
    reason: &'static str,
}

fn production_port_state() -> PortState {
    PortState {
        available: false,
        reason: "Authenticated Rust-to-Node native-desk transport is not connected.",
    }
}

mod native {
    use super::*;
    use std::mem::size_of;
    use std::os::windows::ffi::OsStringExt;
    use windows::core::{HSTRING, PCWSTR, PWSTR};
    use windows::Win32::Foundation::{
        CloseHandle, ERROR_INSUFFICIENT_BUFFER, FILETIME, HANDLE, HWND, LPARAM, POINT, RECT,
        RPC_E_CHANGED_MODE,
    };
    use windows::Win32::Graphics::Dwm::{
        DwmGetWindowAttribute, DWMWA_CLOAKED, DWMWA_EXTENDED_FRAME_BOUNDS,
    };
    use windows::Win32::Security::{
        GetTokenInformation, TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY,
    };
    use windows::Win32::Storage::Packaging::Appx::{
        GetApplicationUserModelId, GetPackageFamilyName, GetPackageFullName,
        GetPackagePathByFullName, GetPackagesByPackageFamily,
    };
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_LOCAL_SERVER, COINIT_MULTITHREADED,
    };
    use windows::Win32::System::Threading::{
        GetProcessTimes, OpenProcess, OpenProcessToken, QueryFullProcessImageNameW,
        PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::HiDpi::GetDpiForWindow;
    use windows::Win32::UI::Shell::{
        ApplicationActivationManager, IApplicationActivationManager, IVirtualDesktopManager,
        VirtualDesktopManager, AO_NONE,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetAncestor, GetClassNameW, GetForegroundWindow, GetWindow, GetWindowLongPtrW,
        GetWindowPlacement, GetWindowRect, GetWindowThreadProcessId, IsIconic, IsWindowVisible,
        SetForegroundWindow, SetWindowPlacement, SetWindowPos, ShowWindowAsync, GA_ROOT,
        GWL_EXSTYLE, GW_OWNER, SET_WINDOW_POS_FLAGS, SWP_ASYNCWINDOWPOS, SWP_NOOWNERZORDER,
        SWP_NOZORDER, SWP_SHOWWINDOW, SW_MINIMIZE, SW_RESTORE, WINDOWPLACEMENT, WS_EX_TOOLWINDOW,
    };

    pub(super) struct NativeWindowsOs;

    struct Handle(HANDLE);
    impl Drop for Handle {
        fn drop(&mut self) {
            unsafe {
                let _ = CloseHandle(self.0);
            }
        }
    }

    unsafe extern "system" fn collect_hwnd(hwnd: HWND, lparam: LPARAM) -> windows::core::BOOL {
        let output = &mut *(lparam.0 as *mut Vec<isize>);
        output.push(hwnd.0 as isize);
        true.into()
    }

    fn utf16(value: &[u16]) -> String {
        let end = value.iter().position(|ch| *ch == 0).unwrap_or(value.len());
        String::from_utf16_lossy(&value[..end])
    }

    unsafe fn package_string(
        handle: HANDLE,
        call: unsafe fn(HANDLE, *mut u32, Option<PWSTR>) -> windows::Win32::Foundation::WIN32_ERROR,
    ) -> Result<String, String> {
        let mut length = 0;
        let first = call(handle, &mut length, None);
        if first != ERROR_INSUFFICIENT_BUFFER || length == 0 {
            return Err("Packaged process identity is unavailable.".into());
        }
        let mut buffer = vec![0u16; length as usize];
        let result = call(handle, &mut length, Some(PWSTR(buffer.as_mut_ptr())));
        if result.is_err() {
            return Err("Packaged process identity changed during inspection.".into());
        }
        Ok(utf16(&buffer))
    }

    unsafe fn package_path(full_name: &str) -> Result<PathBuf, String> {
        let name: Vec<u16> = full_name.encode_utf16().chain(Some(0)).collect();
        let mut length = 0;
        let first = GetPackagePathByFullName(PCWSTR(name.as_ptr()), &mut length, None);
        if first != ERROR_INSUFFICIENT_BUFFER || length == 0 {
            return Err("Package deployment path is unavailable.".into());
        }
        let mut buffer = vec![0u16; length as usize];
        if GetPackagePathByFullName(
            PCWSTR(name.as_ptr()),
            &mut length,
            Some(PWSTR(buffer.as_mut_ptr())),
        )
        .is_err()
        {
            return Err("Package deployment changed during inspection.".into());
        }
        Ok(PathBuf::from(std::ffi::OsString::from_wide(
            &buffer[..buffer.iter().position(|v| *v == 0).unwrap_or(buffer.len())],
        )))
    }

    unsafe fn image_path(handle: HANDLE) -> Result<PathBuf, String> {
        let mut buffer = vec![0u16; 32768];
        let mut length = buffer.len() as u32;
        QueryFullProcessImageNameW(
            handle,
            PROCESS_NAME_WIN32,
            PWSTR(buffer.as_mut_ptr()),
            &mut length,
        )
        .map_err(|_| "Process executable is unavailable.".to_string())?;
        Ok(PathBuf::from(std::ffi::OsString::from_wide(
            &buffer[..length as usize],
        )))
    }

    unsafe fn process_start(handle: HANDLE) -> Result<u64, String> {
        let mut created = FILETIME::default();
        let mut exited = FILETIME::default();
        let mut kernel = FILETIME::default();
        let mut user = FILETIME::default();
        GetProcessTimes(handle, &mut created, &mut exited, &mut kernel, &mut user)
            .map_err(|_| "Process start time is unavailable.".to_string())?;
        Ok(((created.dwHighDateTime as u64) << 32) | created.dwLowDateTime as u64)
    }

    unsafe fn elevated(handle: HANDLE) -> Result<bool, String> {
        let mut token = HANDLE::default();
        OpenProcessToken(handle, TOKEN_QUERY, &mut token)
            .map_err(|_| "Process elevation is unknown.".to_string())?;
        let token = Handle(token);
        let mut value = TOKEN_ELEVATION::default();
        let mut returned = 0;
        GetTokenInformation(
            token.0,
            TokenElevation,
            Some(&mut value as *mut _ as _),
            size_of::<TOKEN_ELEVATION>() as u32,
            &mut returned,
        )
        .map_err(|_| "Process elevation is unknown.".to_string())?;
        Ok(value.TokenIsElevated != 0)
    }

    unsafe fn current_desktop(hwnd: HWND) -> Result<bool, String> {
        let initialized = CoInitializeEx(None, COINIT_MULTITHREADED);
        if initialized.is_err() && initialized != RPC_E_CHANGED_MODE {
            return Err("Virtual desktop state is unavailable.".into());
        }
        let manager: Result<IVirtualDesktopManager, _> =
            CoCreateInstance(&VirtualDesktopManager, None, CLSCTX_LOCAL_SERVER);
        let result = manager
            .and_then(|value| value.IsWindowOnCurrentVirtualDesktop(hwnd))
            .map(|value| value.as_bool())
            .map_err(|_| "Virtual desktop state is unavailable.".to_string());
        if initialized.is_ok() {
            CoUninitialize();
        }
        result
    }

    unsafe fn inspect(hwnd: HWND) -> Result<RawWindow, String> {
        let mut pid = 0;
        if GetWindowThreadProcessId(hwnd, Some(&mut pid)) == 0 || pid == 0 {
            return Err("Window process is unavailable.".into());
        }
        let handle = Handle(
            OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid)
                .map_err(|_| "Window process cannot be inspected.".to_string())?,
        );
        let start_before = process_start(handle.0)?;
        let family = package_string(handle.0, GetPackageFamilyName)?;
        let aumid = package_string(handle.0, GetApplicationUserModelId)?;
        let full_name = package_string(handle.0, GetPackageFullName)?;
        let install_root = package_path(&full_name)?;
        let executable = image_path(handle.0)?;
        let relative = relative_from_root(&install_root, &executable)
            .ok_or_else(|| "Process is outside its exact package deployment.".to_string())?;
        let mut class = [0u16; 256];
        let class_length = GetClassNameW(hwnd, &mut class);
        if class_length < 1 {
            return Err("Window class is unavailable.".into());
        }
        let mut bounds = RECT::default();
        if DwmGetWindowAttribute(
            hwnd,
            DWMWA_EXTENDED_FRAME_BOUNDS,
            &mut bounds as *mut _ as _,
            size_of::<RECT>() as u32,
        )
        .is_err()
        {
            GetWindowRect(hwnd, &mut bounds)
                .map_err(|_| "Window bounds are unavailable.".to_string())?;
        }
        let mut cloak = 0u32;
        let _ = DwmGetWindowAttribute(
            hwnd,
            DWMWA_CLOAKED,
            &mut cloak as *mut _ as _,
            size_of::<u32>() as u32,
        );
        let mut placement = WINDOWPLACEMENT {
            length: size_of::<WINDOWPLACEMENT>() as u32,
            ..Default::default()
        };
        GetWindowPlacement(hwnd, &mut placement)
            .map_err(|_| "Window placement is unavailable.".to_string())?;
        let mut pid_after = 0;
        if GetWindowThreadProcessId(hwnd, Some(&mut pid_after)) == 0
            || pid_after != pid
            || process_start(handle.0)? != start_before
        {
            return Err("Window identity changed during inspection.".into());
        }
        let owner = GetWindow(hwnd, GW_OWNER).ok().map(|value| value.0 as isize);
        let root = GetAncestor(hwnd, GA_ROOT);
        if root.is_invalid() {
            return Err("Window root is unavailable.".into());
        }
        let ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
        let normal = placement.rcNormalPosition;
        Ok(RawWindow {
            hwnd: hwnd.0 as isize,
            root_hwnd: root.0 as isize,
            owner_hwnd: owner,
            pid,
            process_start_time: start_before,
            package_family_name: family,
            application_user_model_id: aumid,
            package_full_name: full_name,
            package_install_root: install_root,
            process_executable: executable,
            relative_executable: relative,
            window_class: utf16(&class[..class_length as usize]),
            visible: IsWindowVisible(hwnd).as_bool(),
            iconic: IsIconic(hwnd).as_bool(),
            cloaked: cloak != 0,
            tool_window: ex_style & WS_EX_TOOLWINDOW.0 != 0,
            elevated: elevated(handle.0)?,
            on_current_desktop: current_desktop(hwnd)?,
            bounds: PhysicalRect {
                x: bounds.left,
                y: bounds.top,
                width: bounds.right - bounds.left,
                height: bounds.bottom - bounds.top,
            },
            dpi: GetDpiForWindow(hwnd),
            focused: GetForegroundWindow() == hwnd,
            placement: WindowPlacement {
                flags: placement.flags.0,
                show_command: placement.showCmd,
                min_position: (placement.ptMinPosition.x, placement.ptMinPosition.y),
                max_position: (placement.ptMaxPosition.x, placement.ptMaxPosition.y),
                normal: PhysicalRect {
                    x: normal.left,
                    y: normal.top,
                    width: normal.right - normal.left,
                    height: normal.bottom - normal.top,
                },
            },
        })
    }

    fn hwnd(token: &WindowToken) -> HWND {
        HWND(token.hwnd as *mut _)
    }

    unsafe fn checked_hwnd(token: &WindowToken) -> Result<HWND, String> {
        let handle = hwnd(token);
        let current = inspect(handle)?;
        if token_from_raw(&current) != *token {
            return Err("Windows process or HWND identity changed before mutation.".into());
        }
        Ok(handle)
    }

    impl WindowsOs for NativeWindowsOs {
        fn enumerate(&self) -> Result<Vec<RawWindow>, String> {
            let mut handles = Vec::<isize>::new();
            unsafe {
                EnumWindows(Some(collect_hwnd), LPARAM(&mut handles as *mut _ as isize))
                    .map_err(|_| "Top-level window enumeration failed.".to_string())?;
            }
            Ok(handles
                .into_iter()
                .filter_map(|value| unsafe { inspect(HWND(value as *mut _)).ok() })
                .collect())
        }

        fn application_found(&self, client: &RegisteredWindowsClient) -> Result<bool, String> {
            let family: Vec<u16> = client
                .package_family_name
                .encode_utf16()
                .chain(Some(0))
                .collect();
            let mut count = 0u32;
            let mut buffer_length = 0u32;
            let first = unsafe {
                GetPackagesByPackageFamily(
                    PCWSTR(family.as_ptr()),
                    &mut count,
                    None,
                    &mut buffer_length,
                    None,
                )
            };
            Ok((first == ERROR_INSUFFICIENT_BUFFER || first.is_ok()) && count > 0)
        }

        fn activate(&self, client: &RegisteredWindowsClient) -> Result<(), String> {
            let aumid = client.application_user_model_id.clone();
            std::thread::spawn(move || unsafe {
                CoInitializeEx(None, COINIT_MULTITHREADED)
                    .ok()
                    .map_err(|_| "COM initialization failed.".to_string())?;
                let manager: IApplicationActivationManager =
                    CoCreateInstance(&ApplicationActivationManager, None, CLSCTX_LOCAL_SERVER)
                        .map_err(|_| {
                            "Application activation manager is unavailable.".to_string()
                        })?;
                let result = manager
                    .ActivateApplication(&HSTRING::from(aumid), PCWSTR::null(), AO_NONE)
                    .map(|_| ())
                    .map_err(|_| "Registered packaged application failed to activate.".to_string());
                CoUninitialize();
                result
            })
            .join()
            .map_err(|_| "Application activation thread failed.".to_string())?
        }

        fn minimize(&self, token: &WindowToken) -> Result<(), String> {
            unsafe {
                let _ = ShowWindowAsync(checked_hwnd(token)?, SW_MINIMIZE);
            }
            Ok(())
        }

        fn restore(
            &self,
            token: &WindowToken,
            placement: Option<&WindowPlacement>,
        ) -> Result<(), String> {
            unsafe {
                let handle = checked_hwnd(token)?;
                if let Some(value) = placement {
                    let native = WINDOWPLACEMENT {
                        length: size_of::<WINDOWPLACEMENT>() as u32,
                        flags: windows::Win32::UI::WindowsAndMessaging::WINDOWPLACEMENT_FLAGS(
                            value.flags,
                        ),
                        showCmd: value.show_command,
                        ptMinPosition: POINT {
                            x: value.min_position.0,
                            y: value.min_position.1,
                        },
                        ptMaxPosition: POINT {
                            x: value.max_position.0,
                            y: value.max_position.1,
                        },
                        rcNormalPosition: RECT {
                            left: value.normal.x,
                            top: value.normal.y,
                            right: value.normal.x + value.normal.width,
                            bottom: value.normal.y + value.normal.height,
                        },
                    };
                    SetWindowPlacement(handle, &native)
                        .map_err(|_| "Window placement restore failed.".to_string())?;
                } else {
                    let _ = ShowWindowAsync(handle, SW_RESTORE);
                }
            }
            Ok(())
        }

        fn place(&self, token: &WindowToken, rect: PhysicalRect) -> Result<(), String> {
            unsafe {
                SetWindowPos(
                    checked_hwnd(token)?,
                    None,
                    rect.x,
                    rect.y,
                    rect.width,
                    rect.height,
                    SET_WINDOW_POS_FLAGS(
                        SWP_ASYNCWINDOWPOS.0
                            | SWP_NOOWNERZORDER.0
                            | SWP_NOZORDER.0
                            | SWP_SHOWWINDOW.0,
                    ),
                )
                .map_err(|_| "Window placement failed.".to_string())
            }
        }

        fn focus(&self, token: &WindowToken) -> Result<(), String> {
            if unsafe { SetForegroundWindow(checked_hwnd(token)?).as_bool() } {
                Ok(())
            } else {
                Err("Windows denied foreground focus.".into())
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    #[derive(Clone)]
    struct FakeOs {
        windows: Arc<RefCell<Vec<RawWindow>>>,
        calls: Arc<RefCell<Vec<&'static str>>>,
    }

    impl FakeOs {
        fn new(windows: Vec<RawWindow>) -> Self {
            Self {
                windows: Arc::new(RefCell::new(windows)),
                calls: Arc::new(RefCell::new(Vec::new())),
            }
        }
        fn mutate(
            &self,
            token: &WindowToken,
            operation: impl FnOnce(&mut RawWindow),
        ) -> Result<(), String> {
            let mut windows = self.windows.borrow_mut();
            let value = windows
                .iter_mut()
                .find(|raw| {
                    raw.hwnd == token.hwnd
                        && raw.pid == token.pid
                        && raw.process_start_time == token.process_start_time
                })
                .ok_or_else(|| "fake identity mismatch".to_string())?;
            operation(value);
            Ok(())
        }
    }

    impl WindowsOs for FakeOs {
        fn enumerate(&self) -> Result<Vec<RawWindow>, String> {
            Ok(self.windows.borrow().clone())
        }
        fn application_found(&self, _client: &RegisteredWindowsClient) -> Result<bool, String> {
            Ok(true)
        }
        fn activate(&self, _client: &RegisteredWindowsClient) -> Result<(), String> {
            self.calls.borrow_mut().push("activate");
            Ok(())
        }
        fn minimize(&self, token: &WindowToken) -> Result<(), String> {
            self.calls.borrow_mut().push("minimize");
            self.mutate(token, |raw| raw.iconic = true)
        }
        fn restore(
            &self,
            token: &WindowToken,
            placement: Option<&WindowPlacement>,
        ) -> Result<(), String> {
            self.calls.borrow_mut().push("restore");
            self.mutate(token, |raw| {
                raw.iconic = false;
                raw.visible = true;
                if let Some(value) = placement {
                    raw.bounds = value.normal;
                    raw.placement = value.clone();
                }
            })
        }
        fn place(&self, token: &WindowToken, rect: PhysicalRect) -> Result<(), String> {
            self.calls.borrow_mut().push("place");
            self.mutate(token, |raw| raw.bounds = rect)
        }
        fn focus(&self, token: &WindowToken) -> Result<(), String> {
            self.calls.borrow_mut().push("focus");
            self.mutate(token, |raw| raw.focused = true)
        }
    }

    fn client() -> RegisteredWindowsClient {
        RegisteredWindowsClient::from_registry(
            "chatgpt",
            "OpenAI.Codex_2p2nqsd0c76g0",
            "OpenAI.Codex_2p2nqsd0c76g0!App",
            &["app/ChatGPT.exe"],
            &["Chrome_WidgetWin_1"],
        )
        .unwrap()
    }

    fn window() -> RawWindow {
        let root =
            PathBuf::from(r"C:\Program Files\WindowsApps\OpenAI.Codex_1.0_x64__2p2nqsd0c76g0");
        let bounds = PhysicalRect {
            x: 100,
            y: 100,
            width: 900,
            height: 700,
        };
        RawWindow {
            hwnd: 17,
            root_hwnd: 17,
            owner_hwnd: None,
            pid: 42,
            process_start_time: 100,
            package_family_name: "OpenAI.Codex_2p2nqsd0c76g0".into(),
            application_user_model_id: "OpenAI.Codex_2p2nqsd0c76g0!App".into(),
            package_full_name: "OpenAI.Codex_1.0_x64__2p2nqsd0c76g0".into(),
            package_install_root: root.clone(),
            process_executable: root.join(r"app\ChatGPT.exe"),
            relative_executable: r"app\chatgpt.exe".into(),
            window_class: "Chrome_WidgetWin_1".into(),
            visible: true,
            iconic: false,
            cloaked: false,
            tool_window: false,
            elevated: false,
            on_current_desktop: true,
            bounds,
            dpi: 144,
            focused: false,
            placement: WindowPlacement {
                flags: 0,
                show_command: 1,
                min_position: (0, 0),
                max_position: (0, 0),
                normal: bounds,
            },
        }
    }

    #[test]
    fn registry_and_inventory_require_exact_stable_package_identity() {
        assert!(RegisteredWindowsClient::from_registry(
            "chatgpt",
            "family",
            "other!App",
            &["app.exe"],
            &["Class"]
        )
        .is_err());
        assert!(RegisteredWindowsClient::from_registry(
            "chatgpt",
            "family_x",
            "family_x!App",
            &[r"..\app.exe"],
            &["Class"]
        )
        .is_err());
        let fake = FakeOs::new(vec![window()]);
        let (driver, context) = WindowsNativeDriver::bind(fake);
        assert_eq!(driver.one(&context, &client()).unwrap().token.hwnd, 17);
    }

    #[test]
    fn forged_context_and_recycled_process_or_hwnd_fail_closed() {
        let fake = FakeOs::new(vec![window()]);
        let (driver, context) = WindowsNativeDriver::bind(fake.clone());
        let verified = driver.one(&context, &client()).unwrap();
        let (_, forged) = WindowsNativeDriver::bind(fake.clone());
        assert!(driver.inventory(&forged, &client()).is_err());
        fake.windows.borrow_mut()[0].process_start_time += 1;
        assert!(driver.minimize(&context, &verified).is_err());
        assert!(fake.calls.borrow().is_empty());
    }

    #[test]
    fn only_recoverable_exact_window_operations_are_available() {
        let fake = FakeOs::new(vec![window()]);
        let (driver, context) = WindowsNativeDriver::bind(fake.clone());
        let original = driver.one(&context, &client()).unwrap();
        let minimized = driver.minimize(&context, &original).unwrap();
        let restored = driver
            .restore(&context, &minimized, Some(&original.raw.placement))
            .unwrap();
        let slot = PhysicalRect::checked(-1200, 120, 1000, 760).unwrap();
        let placed = driver.place(&context, &restored, slot).unwrap();
        let focused = driver.focus(&context, &placed).unwrap();
        assert_eq!(focused.raw.bounds, slot);
        assert_eq!(
            &*fake.calls.borrow(),
            &["minimize", "restore", "place", "focus"]
        );
    }

    #[test]
    fn elevated_foreign_cloaked_and_multiple_windows_are_denied() {
        let mutations: [fn(&mut RawWindow); 3] = [
            |raw: &mut RawWindow| raw.elevated = true,
            |raw: &mut RawWindow| raw.on_current_desktop = false,
            |raw: &mut RawWindow| raw.cloaked = true,
        ];
        for mutation in mutations {
            let mut value = window();
            mutation(&mut value);
            let (driver, context) = WindowsNativeDriver::bind(FakeOs::new(vec![value]));
            assert!(driver.inventory(&context, &client()).unwrap().is_empty());
        }
        let (driver, context) = WindowsNativeDriver::bind(FakeOs::new(vec![window(), window()]));
        assert!(driver.one(&context, &client()).is_err());
    }

    #[test]
    fn production_port_is_explicitly_disconnected() {
        let state = production_port_state();
        assert!(!state.available);
        assert!(state.reason.contains("not connected"));
    }
}
