// BioViz Local - Rust Backend with Python Sidecar Process Management
// This module handles the lifecycle of the Python sidecar subprocess

use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;
use std::path::PathBuf;

/// Application state holding the Python subprocess handle
pub struct AppState {
    /// Handle to the Python subprocess for sending commands
    child: Arc<Mutex<Option<CommandChild>>>,
    /// Flag indicating if the sidecar is running
    is_running: Arc<Mutex<bool>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            child: Arc::new(Mutex::new(None)),
            is_running: Arc::new(Mutex::new(false)),
        }
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}

/// Response event structure for frontend
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SidecarEvent {
    pub event_type: String,
    pub data: String,
}

/// Send a command to the Python sidecar via stdin
#[tauri::command]
async fn send_command(state: State<'_, AppState>, payload: String) -> Result<String, String> {
    let mut child_guard = state.child.lock().map_err(|e| e.to_string())?;

    if let Some(ref mut child) = *child_guard {
        // Ensure payload ends with newline for line-based protocol
        let mut cmd = payload;
        if !cmd.ends_with('\n') {
            cmd.push('\n');
        }

        // Write to the child's stdin
        child
            .write(cmd.as_bytes())
            .map_err(|e| format!("Failed to write to sidecar: {}", e))?;

        Ok("Command sent".to_string())
    } else {
        Err("Sidecar not running".to_string())
    }
}

/// Check if the sidecar is running
#[tauri::command]
fn is_sidecar_running(state: State<'_, AppState>) -> bool {
    *state.is_running.lock().unwrap_or_else(|e| e.into_inner())
}

/// Send a heartbeat to check sidecar health
#[tauri::command]
async fn heartbeat(state: State<'_, AppState>) -> Result<String, String> {
    send_command(state, r#"{"cmd": "HEARTBEAT"}"#.to_string()).await
}

/// Restart the sidecar if it's not running
#[tauri::command]
async fn restart_sidecar(
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> Result<String, String> {
    // Kill existing process if any
    {
        let mut child_guard = state.child.lock().map_err(|e| e.to_string())?;
        if let Some(child) = child_guard.take() {
            let _ = child.kill();
        }
    }

    // Spawn new sidecar
    spawn_sidecar(&app_handle, &state)?;
    Ok("Sidecar restarted".to_string())
}

/// Open or toggle developer tools
#[tauri::command]
fn open_devtools(window: tauri::Window) {
    #[cfg(feature = "devtools")]
    {
        if let Some(webview) = window.get_webview_window("main") {
            webview.open_devtools();
        } else {
            // Fallback: try to open on current window
            eprintln!("[BioViz] Could not find main webview window for devtools");
        }
    }
    
    #[cfg(not(feature = "devtools"))]
    {
        let _ = window;
        eprintln!("[BioViz] Devtools feature not enabled");
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState::new())
        .setup(|app| {
            let app_handle = app.handle().clone();
            let state = app.state::<AppState>();

            // Spawn the Python sidecar
            match spawn_sidecar(&app_handle, &state) {
                Ok(_) => {
                    println!("[BioViz] Engine sidecar started successfully");
                }
                Err(e) => {
                    eprintln!("[BioViz] Failed to start sidecar: {}", e);
                    // Don't fail app startup, but log the error
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            // Open devtools with Cmd+Shift+I shortcut
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                // No action needed
            }
            
            // Clean up on window close or destroy
            if let tauri::WindowEvent::Destroyed = event {
                cleanup_sidecar(window.state::<AppState>());
            }
        })
        .invoke_handler(tauri::generate_handler![
            send_command,
            is_sidecar_running,
            heartbeat,
            restart_sidecar,
            open_devtools  // Add new command
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Clean up the sidecar process
fn cleanup_sidecar(state: State<'_, AppState>) {
    println!("[BioViz] Cleaning up sidecar process...");

    // Mark as not running
    if let Ok(mut is_running) = state.is_running.lock() {
        *is_running = false;
    }

    // Kill the child process
    if let Ok(mut child_guard) = state.child.lock() {
        if let Some(child) = child_guard.take() {
            match child.kill() {
                Ok(_) => println!("[BioViz] Sidecar process killed successfully"),
                Err(e) => eprintln!("[BioViz] Failed to kill sidecar: {}", e),
            }
        }
    }
}

/// Spawn the Python sidecar process using Tauri's shell plugin
fn spawn_sidecar(app_handle: &AppHandle, state: &State<'_, AppState>) -> Result<(), String> {
    // In dev builds, prefer running the Python source directly so backend edits take effect
    // without rebuilding the PyInstaller sidecar binary.
    #[cfg(debug_assertions)]
    let sidecar_command = {
        let repo_root: PathBuf = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap_or_else(|| std::path::Path::new("."))
            .to_path_buf();
        let script = repo_root.join("python").join("bio_engine.py");

        if script.exists() {
            // Try miniconda Python first (has gseapy installed), fallback to system python3
            let python = if cfg!(target_os = "windows") { 
                "python".to_string() 
            } else {
                // Check if miniconda Python exists with required packages
                let miniconda_python = std::path::Path::new("/Users/haifeng/miniconda3/bin/python3");
                if miniconda_python.exists() {
                    miniconda_python.to_string_lossy().to_string()
                } else {
                    "python3".to_string()
                }
            };
            println!(
                "[BioViz] Dev mode: spawning Python engine from source: {}",
                script.display()
            );
            
            // Pass AI configuration environment variables to Python sidecar
            let mut cmd = app_handle
                .shell()
                .command(python)
                .args([script.to_string_lossy().to_string()])
                .env("BIOVIZ_USE_SOURCE", "1");
            
            // Pass AI provider configuration
            if let Ok(provider) = std::env::var("AI_PROVIDER") {
                cmd = cmd.env("AI_PROVIDER", provider);
            }
            if let Ok(key) = std::env::var("DASHSCOPE_API_KEY") {
                cmd = cmd.env("DASHSCOPE_API_KEY", key);
            }
            if let Ok(key) = std::env::var("DEEPSEEK_API_KEY") {
                cmd = cmd.env("DEEPSEEK_API_KEY", key);
            }
            if let Ok(model) = std::env::var("DEEPSEEK_MODEL") {
                cmd = cmd.env("DEEPSEEK_MODEL", model);
            }
            
            cmd
        } else {
            app_handle
                .shell()
                .sidecar("bio-engine")
                .map_err(|e| format!("Failed to create sidecar command: {}", e))?
        }
    };

    #[cfg(not(debug_assertions))]
    let sidecar_command = app_handle
        .shell()
        .sidecar("bio-engine")
        .map_err(|e| format!("Failed to create sidecar command: {}", e))?;

    // Spawn the process
    let (mut rx, child) = sidecar_command
        .spawn()
        .map_err(|e| format!("Failed to spawn sidecar: {}", e))?;

    // Store the child handle for writing
    {
        let mut child_guard = state.child.lock().map_err(|e| e.to_string())?;
        *child_guard = Some(child);
    }

    // Mark as running
    {
        let mut is_running = state.is_running.lock().map_err(|e| e.to_string())?;
        *is_running = true;
    }

    // Clone for the reader thread
    let app_handle_clone = app_handle.clone();
    let is_running_clone = state.is_running.clone();

    // Spawn a thread to read stdout and emit events to frontend
    thread::spawn(move || {
        use tauri_plugin_shell::process::CommandEvent;

        println!("[BioViz] Sidecar reader thread started");

        // Block on receiving events from the sidecar
        while let Some(event) = rx.blocking_recv() {
            // Check if we should stop
            if let Ok(running) = is_running_clone.lock() {
                if !*running {
                    break;
                }
            }

            match event {
                CommandEvent::Stdout(line) => {
                    let output = String::from_utf8_lossy(&line).trim().to_string();
                    if !output.is_empty() {
                        println!("[BioViz] Sidecar stdout: {}", output);
                        // Emit to frontend
                        if let Err(e) = app_handle_clone.emit("sidecar-output", &output) {
                            eprintln!("[BioViz] Failed to emit event: {}", e);
                        }
                    }
                }
                CommandEvent::Stderr(line) => {
                    let error = String::from_utf8_lossy(&line).trim().to_string();
                    if !error.is_empty() {
                        eprintln!("[BioViz] Sidecar stderr: {}", error);
                        if let Err(e) = app_handle_clone.emit("sidecar-error", &error) {
                            eprintln!("[BioViz] Failed to emit error event: {}", e);
                        }
                    }
                }
                CommandEvent::Error(error) => {
                    eprintln!("[BioViz] Sidecar error: {}", error);
                    if let Err(e) = app_handle_clone.emit("sidecar-error", &error) {
                        eprintln!("[BioViz] Failed to emit error event: {}", e);
                    }
                }
                CommandEvent::Terminated(status) => {
                    println!("[BioViz] Sidecar terminated with status: {:?}", status);
                    let _ = app_handle_clone.emit("sidecar-terminated", format!("{:?}", status));
                    break;
                }
                _ => {}
            }
        }

        println!("[BioViz] Sidecar reader thread exiting");
    });

    Ok(())
}
