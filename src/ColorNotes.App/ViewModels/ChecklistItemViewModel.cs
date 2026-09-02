using ColorNotes.Models;

namespace ColorNotes.ViewModels;

public sealed class ChecklistItemViewModel : ObservableObject
{
    private readonly ChecklistItem _item;

    public ChecklistItemViewModel(ChecklistItem item) => _item = item;

    public ChecklistItem Model => _item;

    public string Text
    {
        get => _item.Text;
        set
        {
            if (_item.Text == value) return;
            _item.Text = value;
            OnPropertyChanged();
            Changed?.Invoke(this, EventArgs.Empty);
        }
    }

    public bool IsCompleted
    {
        get => _item.IsCompleted;
        set
        {
            if (_item.IsCompleted == value) return;
            _item.IsCompleted = value;
            OnPropertyChanged();
            Changed?.Invoke(this, EventArgs.Empty);
        }
    }

    public event EventHandler? Changed;
}

