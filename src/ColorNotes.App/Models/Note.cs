namespace ColorNotes.Models;

public sealed class Note
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public NoteKind Kind { get; set; }
    public NoteColor Color { get; set; } = NoteColor.Yellow;
    public string Title { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
    public List<ChecklistItem> ChecklistItems { get; set; } = [];
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.Now;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.Now;
    public DateTimeOffset? ReminderAt { get; set; }
    public DateTimeOffset? DeletedAt { get; set; }
    public bool IsPinned { get; set; }
    public bool IsArchived { get; set; }

    public string Preview
    {
        get
        {
            if (Kind == NoteKind.Checklist)
            {
                var remaining = ChecklistItems.Where(item => !item.IsCompleted)
                    .Select(item => item.Text.Trim())
                    .Where(text => text.Length > 0)
                    .Take(3);
                return string.Join("  ·  ", remaining);
            }

            return Content.ReplaceLineEndings(" ").Trim();
        }
    }

    public Note Copy() => new()
    {
        Id = Id,
        Kind = Kind,
        Color = Color,
        Title = Title,
        Content = Content,
        ChecklistItems = ChecklistItems.Select(item => new ChecklistItem
        {
            Id = item.Id,
            Text = item.Text,
            IsCompleted = item.IsCompleted
        }).ToList(),
        CreatedAt = CreatedAt,
        UpdatedAt = UpdatedAt,
        ReminderAt = ReminderAt,
        DeletedAt = DeletedAt,
        IsPinned = IsPinned,
        IsArchived = IsArchived
    };
}

