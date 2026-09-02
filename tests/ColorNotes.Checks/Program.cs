using ColorNotes.Models;
using ColorNotes.Services;

var checkDirectory = Path.Combine(Path.GetTempPath(), "ColorNotes-check-" + Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(checkDirectory);

try
{
    var reminder = DateTimeOffset.Now.AddHours(3);
    var original = new Note
    {
        Kind = NoteKind.Checklist,
        Color = NoteColor.Ocean,
        Title = "Release checklist",
        Content = "Preserved even for checklist notes",
        IsPinned = true,
        IsArchived = true,
        ReminderAt = reminder,
        ChecklistItems =
        [
            new ChecklistItem { Text = "Build", IsCompleted = true },
            new ChecklistItem { Text = "Publish" }
        ]
    };

    var backupPath = Path.Combine(checkDirectory, "roundtrip.colornotes");
    var service = new NoteBackupService();
    await service.ExportAsync(backupPath, [original]);
    var imported = await service.ImportAsync(backupPath);

    Require(imported.Count == 1, "Expected one imported note.");
    var restored = imported[0];
    Require(restored.Id == original.Id, "Note ID changed during backup.");
    Require(restored.Kind == NoteKind.Checklist, "Note kind changed during backup.");
    Require(restored.Color == NoteColor.Ocean, "Note color changed during backup.");
    Require(restored.Title == original.Title, "Title changed during backup.");
    Require(restored.Content == original.Content, "Content changed during backup.");
    Require(restored.IsPinned && restored.IsArchived, "Note state changed during backup.");
    Require(restored.ReminderAt == reminder, "Reminder changed during backup.");
    Require(restored.ChecklistItems.Count == 2, "Checklist items were lost.");
    Require(restored.ChecklistItems[0].IsCompleted, "Checklist completion state was lost.");
    Require(restored.ChecklistItems[1].Text == "Publish", "Checklist text changed.");

    var copy = original.Copy();
    copy.ChecklistItems[0].Text = "Changed";
    Require(original.ChecklistItems[0].Text == "Build", "Note.Copy must be a deep copy.");

    var storeDirectory = Path.Combine(checkDirectory, "store");
    var store = new NoteStore(storeDirectory);
    await store.SaveAsync([original]);
    var firstLoad = await store.LoadAsync();
    Require(firstLoad.Count == 1 && firstLoad[0].Id == original.Id, "Live store failed to reload a saved note.");

    var changed = original.Copy();
    changed.Title = "Newer title";
    changed.UpdatedAt = changed.UpdatedAt.AddMinutes(1);
    await store.SaveAsync([changed]);
    await File.WriteAllTextAsync(Path.Combine(storeDirectory, "notes.json"), "{corrupted");
    var recovered = await store.LoadAsync();
    Require(recovered.Count == 1, "Store did not recover from its backup.");
    Require(recovered[0].Title == original.Title, "Store recovery did not use the last valid snapshot.");

    Console.WriteLine("Color Notes checks passed.");
}
finally
{
    if (Directory.Exists(checkDirectory)) Directory.Delete(checkDirectory, recursive: true);
}

static void Require(bool condition, string message)
{
    if (!condition) throw new InvalidOperationException(message);
}
