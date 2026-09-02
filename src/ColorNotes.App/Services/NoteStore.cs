using System.Text.Json;
using System.Text.Json.Serialization;
using System.IO;
using ColorNotes.Models;

namespace ColorNotes.Services;

public sealed class NoteStore
{
    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly string _dataDirectory;
    private readonly string _notesFile;
    private readonly string _backupFile;
    private readonly JsonSerializerOptions _jsonOptions = new()
    {
        WriteIndented = true,
        Converters = { new JsonStringEnumConverter() }
    };

    public NoteStore(string? dataDirectory = null)
    {
        _dataDirectory = dataDirectory ?? AppPaths.DataDirectory;
        _notesFile = Path.Combine(_dataDirectory, "notes.json");
        _backupFile = Path.Combine(_dataDirectory, "notes.backup.json");
    }

    public async Task<IReadOnlyList<Note>> LoadAsync(CancellationToken cancellationToken = default)
    {
        Directory.CreateDirectory(_dataDirectory);

        var notes = await TryReadAsync(_notesFile, cancellationToken)
                    ?? await TryReadAsync(_backupFile, cancellationToken)
                    ?? [];

        return notes.OrderByDescending(note => note.IsPinned)
            .ThenByDescending(note => note.UpdatedAt)
            .ToList();
    }

    public async Task SaveAsync(IEnumerable<Note> notes, CancellationToken cancellationToken = default)
    {
        await _gate.WaitAsync(cancellationToken);
        try
        {
            Directory.CreateDirectory(_dataDirectory);
            var snapshot = notes.Select(note => note.Copy()).ToList();
            var temporaryFile = _notesFile + ".tmp";

            await using (var stream = File.Create(temporaryFile))
            {
                await JsonSerializer.SerializeAsync(stream, snapshot, _jsonOptions, cancellationToken);
                await stream.FlushAsync(cancellationToken);
            }

            if (File.Exists(_notesFile))
            {
                File.Copy(_notesFile, _backupFile, overwrite: true);
            }

            File.Move(temporaryFile, _notesFile, overwrite: true);
        }
        finally
        {
            _gate.Release();
        }
    }

    private async Task<List<Note>?> TryReadAsync(string path, CancellationToken cancellationToken)
    {
        if (!File.Exists(path))
        {
            return null;
        }

        try
        {
            await using var stream = File.OpenRead(path);
            return await JsonSerializer.DeserializeAsync<List<Note>>(stream, _jsonOptions, cancellationToken);
        }
        catch (JsonException)
        {
            return null;
        }
        catch (IOException)
        {
            return null;
        }
    }
}
