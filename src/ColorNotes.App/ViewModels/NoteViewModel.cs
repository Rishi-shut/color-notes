using System.Collections.ObjectModel;
using ColorNotes.Models;

namespace ColorNotes.ViewModels;

public sealed class NoteViewModel : ObservableObject
{
    private readonly Note _note;

    public NoteViewModel(Note note)
    {
        _note = note;
        ChecklistItems = new ObservableCollection<ChecklistItemViewModel>(
            note.ChecklistItems.Select(CreateChecklistItem));
    }

    public Note Model => _note;
    public Guid Id => _note.Id;
    public NoteKind Kind => _note.Kind;
    public ObservableCollection<ChecklistItemViewModel> ChecklistItems { get; }

    public string Title
    {
        get => _note.Title;
        set => Update(_note.Title, value ?? string.Empty, newValue => _note.Title = newValue);
    }

    public string Content
    {
        get => _note.Content;
        set => Update(_note.Content, value ?? string.Empty, newValue => _note.Content = newValue);
    }

    public NoteColor Color
    {
        get => _note.Color;
        set => Update(_note.Color, value, newValue => _note.Color = newValue);
    }

    public bool IsPinned
    {
        get => _note.IsPinned;
        set => Update(_note.IsPinned, value, newValue => _note.IsPinned = newValue);
    }

    public bool IsArchived
    {
        get => _note.IsArchived;
        set => Update(_note.IsArchived, value, newValue => _note.IsArchived = newValue);
    }

    public DateTimeOffset? DeletedAt
    {
        get => _note.DeletedAt;
        set => Update(_note.DeletedAt, value, newValue => _note.DeletedAt = newValue);
    }

    public DateTimeOffset? ReminderAt
    {
        get => _note.ReminderAt;
        set => Update(_note.ReminderAt, value, newValue => _note.ReminderAt = newValue);
    }

    public DateTimeOffset UpdatedAt => _note.UpdatedAt;
    public string Preview => _note.Preview;
    public bool IsChecklist => Kind == NoteKind.Checklist;
    public bool IsTextNote => Kind == NoteKind.Text;
    public bool IsTrashed => DeletedAt is not null;
    public bool HasReminder => ReminderAt is not null;
    public string DisplayTitle => string.IsNullOrWhiteSpace(Title) ? "Untitled note" : Title.Trim();
    public string UpdatedLabel => UpdatedAt.LocalDateTime.ToString("MMM d, h:mm tt");
    public string ReminderLabel => ReminderAt?.LocalDateTime.ToString("ddd, MMM d · h:mm tt") ?? "Add reminder";

    public ChecklistItemViewModel AddChecklistItem(string text = "")
    {
        var model = new ChecklistItem { Text = text };
        _note.ChecklistItems.Add(model);
        var item = CreateChecklistItem(model);
        ChecklistItems.Add(item);
        Touch();
        return item;
    }

    public void RemoveChecklistItem(ChecklistItemViewModel item)
    {
        if (!ChecklistItems.Remove(item)) return;
        _note.ChecklistItems.RemoveAll(model => model.Id == item.Model.Id);
        Touch();
    }

    public void NotifyAll()
    {
        OnPropertyChanged(nameof(Title));
        OnPropertyChanged(nameof(Content));
        OnPropertyChanged(nameof(Color));
        OnPropertyChanged(nameof(IsPinned));
        OnPropertyChanged(nameof(IsArchived));
        OnPropertyChanged(nameof(DeletedAt));
        OnPropertyChanged(nameof(ReminderAt));
        OnPropertyChanged(nameof(IsTrashed));
        OnPropertyChanged(nameof(HasReminder));
        OnPropertyChanged(nameof(DisplayTitle));
        OnPropertyChanged(nameof(Preview));
        OnPropertyChanged(nameof(UpdatedAt));
        OnPropertyChanged(nameof(UpdatedLabel));
        OnPropertyChanged(nameof(ReminderLabel));
    }

    public event EventHandler? Changed;

    private ChecklistItemViewModel CreateChecklistItem(ChecklistItem item)
    {
        var viewModel = new ChecklistItemViewModel(item);
        viewModel.Changed += (_, _) => Touch();
        return viewModel;
    }

    private void Update<T>(T currentValue, T value, Action<T> assign,
        [System.Runtime.CompilerServices.CallerMemberName] string? propertyName = null)
    {
        if (EqualityComparer<T>.Default.Equals(currentValue, value)) return;
        assign(value);
        OnPropertyChanged(propertyName);
        Touch();
    }

    private void Touch()
    {
        _note.UpdatedAt = DateTimeOffset.Now;
        OnPropertyChanged(nameof(UpdatedAt));
        OnPropertyChanged(nameof(UpdatedLabel));
        OnPropertyChanged(nameof(DisplayTitle));
        OnPropertyChanged(nameof(Preview));
        OnPropertyChanged(nameof(IsTrashed));
        OnPropertyChanged(nameof(HasReminder));
        OnPropertyChanged(nameof(ReminderLabel));
        Changed?.Invoke(this, EventArgs.Empty);
    }
}
