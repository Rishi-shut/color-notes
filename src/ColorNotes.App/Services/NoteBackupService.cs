using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;
using ColorNotes.Models;

namespace ColorNotes.Services;

public sealed class NoteBackupService
{
    private const long MaximumBackupSize = 50 * 1024 * 1024;
    private readonly JsonSerializerOptions _jsonOptions = new()
    {
        WriteIndented = true,
        Converters = { new JsonStringEnumConverter() }
    };

    public async Task ExportAsync(string path, IEnumerable<Note> notes, CancellationToken cancellationToken = default)
    {
        var backup = new BackupEnvelope
        {
            ExportedAt = DateTimeOffset.Now,
            Notes = notes.Select(note => note.Copy()).ToList()
        };

        var directory = Path.GetDirectoryName(path);
        if (!string.IsNullOrWhiteSpace(directory)) Directory.CreateDirectory(directory);
        var temporaryPath = path + ".tmp";

        try
        {
            await using var stream = File.Create(temporaryPath);
            await JsonSerializer.SerializeAsync(stream, backup, _jsonOptions, cancellationToken);
            await stream.FlushAsync(cancellationToken);
            stream.Close();
            File.Move(temporaryPath, path, overwrite: true);
        }
        finally
        {
            if (File.Exists(temporaryPath)) File.Delete(temporaryPath);
        }
    }

    public async Task<IReadOnlyList<Note>> ImportAsync(string path, CancellationToken cancellationToken = default)
    {
        var file = new FileInfo(path);
        if (!file.Exists) throw new FileNotFoundException("The backup file no longer exists.", path);
        if (file.Length > MaximumBackupSize) throw new InvalidDataException("The backup is larger than 50 MB.");

        await using var stream = File.OpenRead(path);
        var backup = await JsonSerializer.DeserializeAsync<BackupEnvelope>(stream, _jsonOptions, cancellationToken)
                     ?? throw new InvalidDataException("The backup is empty or invalid.");

        if (backup.FormatVersion != 1)
        {
            throw new InvalidDataException($"Backup format {backup.FormatVersion} is not supported.");
        }

        if (backup.Notes.Any(note => note.Id == Guid.Empty))
        {
            throw new InvalidDataException("The backup contains an invalid note identifier.");
        }

        return backup.Notes.Select(note => note.Copy()).ToList();
    }

    private sealed class BackupEnvelope
    {
        public int FormatVersion { get; set; } = 1;
        public DateTimeOffset ExportedAt { get; set; }
        public List<Note> Notes { get; set; } = [];
    }
}

