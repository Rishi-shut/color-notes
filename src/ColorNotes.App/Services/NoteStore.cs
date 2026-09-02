using System.Text.Json;
using System.Text.Json.Serialization;
using ColorNotes.Models;

namespace ColorNotes.Services;

public sealed class NoteStore
{
    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly JsonSerializerOptions _jsonOptions = new()
    {
        WriteIndented = true,
        Converters = { new JsonStringEnumConverter() }
    };

    public async Task<IReadOnlyList<Note>> LoadAsync(CancellationToken cancellationToken = default)
    {
        Directory.CreateDirectory(AppPaths.DataDirectory);

        var notes = await TryReadAsync(AppPaths.NotesFile, cancellationToken)
                    ?? await TryReadAsync(AppPaths.BackupFile, cancellationToken)
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
            Directory.CreateDirectory(AppPaths.DataDirectory);
            var snapshot = notes.Select(note => note.Copy()).ToList();
            var temporaryFile = AppPaths.NotesFile + ".tmp";

            await using (var stream = File.Create(temporaryFile))
            {
                await JsonSerializer.SerializeAsync(stream, snapshot, _jsonOptions, cancellationToken);
                await stream.FlushAsync(cancellationToken);
            }

            if (File.Exists(AppPaths.NotesFile))
            {
                File.Copy(AppPaths.NotesFile, AppPaths.BackupFile, overwrite: true);
            }

            File.Move(temporaryFile, AppPaths.NotesFile, overwrite: true);
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

