namespace ColorNotes.Services;

public static class AppPaths
{
    public static string DataDirectory { get; } = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "ColorNotes");

    public static string NotesFile { get; } = Path.Combine(DataDirectory, "notes.json");
    public static string BackupFile { get; } = Path.Combine(DataDirectory, "notes.backup.json");
}

