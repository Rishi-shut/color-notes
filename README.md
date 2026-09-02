# Color Notes

A fast, private, offline-first notes app for Windows, inspired by the simplicity of ColorNote.

Color Notes is a native WPF desktop application—not a website or embedded browser. It starts quickly, works without an account, and keeps notes on the PC.

## Features

- Text notes and interactive checklists
- Seven calm note colors
- Instant full-text and checklist search
- Pinning, archive, trash, restore, and permanent deletion
- Date-and-time reminders while the app is running
- Automatic saving with atomic writes and recovery backup
- Portable, versioned backup and restore with safe merge behavior
- Keyboard-first capture and editing
- Self-contained Windows release—no separate .NET installation required

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+N` | New text note |
| `Ctrl+Shift+N` | New checklist |
| `Ctrl+F` | Focus search |
| `Ctrl+Z` / `Ctrl+Y` | Undo / redo while editing |

## Privacy and data

Color Notes has no analytics, advertising, sign-in, or cloud dependency. Live data is stored in:

```text
%LOCALAPPDATA%\ColorNotes\notes.json
```

The previous successful snapshot is retained as `notes.backup.json`. Use **Backup & restore** in the app to create a portable `.colornotes` file.

## Principles

- Native Windows desktop experience
- Instant capture and search
- Notes stay on the device
- Color coding without visual clutter
- Keyboard-friendly, accessible interaction

## Development

Requires the .NET 8 SDK on Windows.

```powershell
dotnet build ColorNotes.sln
dotnet run --project src/ColorNotes.App
```

Run the dependency-free integrity checks:

```powershell
dotnet run --project tests/ColorNotes.Checks
```

## Create a standalone release

```powershell
.\scripts\Publish.ps1
```

The release script creates `artifacts\release\ColorNotes-win-x64.zip`. Extract it anywhere and run `ColorNotes.exe`.
