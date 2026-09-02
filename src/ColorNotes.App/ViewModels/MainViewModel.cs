using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Windows.Data;
using ColorNotes.Models;
using ColorNotes.Services;

namespace ColorNotes.ViewModels;

public sealed class MainViewModel : ObservableObject
{
    private readonly NoteStore _store;
    private CancellationTokenSource? _saveDelay;
    private NoteViewModel? _selectedNote;
    private NavigationSection _section;
    private string _searchText = string.Empty;
    private bool _isLoaded;
    private NoteSortMode _sortMode;

    public MainViewModel(NoteStore store)
    {
        _store = store;
        Notes = [];
        NotesView = CollectionViewSource.GetDefaultView(Notes);
        NotesView.Filter = FilterNote;
        ApplySort();

        NewTextNoteCommand = new RelayCommand(_ => CreateNote(NoteKind.Text));
        NewChecklistCommand = new RelayCommand(_ => CreateNote(NoteKind.Checklist));
        SelectSectionCommand = new RelayCommand(SelectSection);
        TogglePinCommand = new RelayCommand(_ => TogglePin(), _ => SelectedNote is not null);
        ArchiveCommand = new RelayCommand(_ => Archive(), _ => SelectedNote is not null);
        TrashCommand = new RelayCommand(_ => Trash(), _ => SelectedNote is not null);
        RestoreCommand = new RelayCommand(_ => Restore(), _ => SelectedNote?.IsTrashed == true);
        DeleteForeverCommand = new RelayCommand(_ => DeleteForever(), _ => SelectedNote?.IsTrashed == true);
        SetColorCommand = new RelayCommand(SetColor, _ => SelectedNote is not null);
        AddChecklistItemCommand = new RelayCommand(_ => SelectedNote?.AddChecklistItem());
        RemoveChecklistItemCommand = new RelayCommand(item =>
        {
            if (item is ChecklistItemViewModel checklistItem) SelectedNote?.RemoveChecklistItem(checklistItem);
        });
    }

    public ObservableCollection<NoteViewModel> Notes { get; }
    public ICollectionView NotesView { get; }

    public NoteViewModel? SelectedNote
    {
        get => _selectedNote;
        set
        {
            if (!SetProperty(ref _selectedNote, value)) return;
            OnPropertyChanged(nameof(HasSelection));
            RaiseCommandStates();
        }
    }

    public NavigationSection Section
    {
        get => _section;
        private set
        {
            if (!SetProperty(ref _section, value)) return;
            OnPropertyChanged(nameof(SectionTitle));
            NotesView.Refresh();
            SelectFirstVisible();
        }
    }

    public string SearchText
    {
        get => _searchText;
        set
        {
            if (!SetProperty(ref _searchText, value ?? string.Empty)) return;
            NotesView.Refresh();
            SelectFirstVisible();
        }
    }

    public bool HasSelection => SelectedNote is not null;
    public NoteSortMode SortMode
    {
        get => _sortMode;
        set
        {
            if (!SetProperty(ref _sortMode, value)) return;
            ApplySort();
        }
    }
    public string SectionTitle => Section switch
    {
        NavigationSection.Reminders => "Reminders",
        NavigationSection.Archive => "Archive",
        NavigationSection.Trash => "Trash",
        _ => "My notes"
    };

    public RelayCommand NewTextNoteCommand { get; }
    public RelayCommand NewChecklistCommand { get; }
    public RelayCommand SelectSectionCommand { get; }
    public RelayCommand TogglePinCommand { get; }
    public RelayCommand ArchiveCommand { get; }
    public RelayCommand TrashCommand { get; }
    public RelayCommand RestoreCommand { get; }
    public RelayCommand DeleteForeverCommand { get; }
    public RelayCommand SetColorCommand { get; }
    public RelayCommand AddChecklistItemCommand { get; }
    public RelayCommand RemoveChecklistItemCommand { get; }
    public event Action<NoteViewModel>? NoteCreated;

    public async Task InitializeAsync()
    {
        if (_isLoaded) return;
        var storedNotes = await _store.LoadAsync();
        foreach (var note in storedNotes)
        {
            AddNoteViewModel(note);
        }

        _isLoaded = true;
        SelectFirstVisible();
    }

    public async Task SaveNowAsync()
    {
        _saveDelay?.Cancel();
        await _store.SaveAsync(Notes.Select(note => note.Model));
    }

    public (int Added, int Updated) MergeImportedNotes(IEnumerable<Note> importedNotes)
    {
        var added = 0;
        var updated = 0;

        foreach (var imported in importedNotes.GroupBy(note => note.Id).Select(group => group.MaxBy(note => note.UpdatedAt)!))
        {
            var existing = Notes.FirstOrDefault(note => note.Id == imported.Id);
            if (existing is null)
            {
                AddNoteViewModel(imported.Copy());
                added++;
                continue;
            }

            if (imported.UpdatedAt <= existing.UpdatedAt) continue;
            var wasSelected = SelectedNote == existing;
            Notes.Remove(existing);
            var replacement = AddNoteViewModel(imported.Copy());
            if (wasSelected) SelectedNote = replacement;
            updated++;
        }

        NotesView.Refresh();
        SelectFirstVisible();
        ScheduleSave();
        return (added, updated);
    }

    private void CreateNote(NoteKind kind)
    {
        Section = NavigationSection.Notes;
        var note = new Note { Kind = kind };
        var viewModel = AddNoteViewModel(note);
        if (kind == NoteKind.Checklist) viewModel.AddChecklistItem();
        NotesView.Refresh();
        SelectedNote = viewModel;
        NoteCreated?.Invoke(viewModel);
        ScheduleSave();
    }

    private NoteViewModel AddNoteViewModel(Note note)
    {
        var viewModel = new NoteViewModel(note);
        viewModel.Changed += (_, _) =>
        {
            NotesView.Refresh();
            RaiseCommandStates();
            ScheduleSave();
        };
        Notes.Add(viewModel);
        return viewModel;
    }

    private void SelectSection(object? parameter)
    {
        if (parameter is NavigationSection section)
        {
            Section = section;
        }
        else if (parameter is string text && Enum.TryParse<NavigationSection>(text, out var parsed))
        {
            Section = parsed;
        }
    }

    private bool FilterNote(object item)
    {
        if (item is not NoteViewModel note) return false;

        var belongsToSection = Section switch
        {
            NavigationSection.Notes => !note.IsTrashed && !note.IsArchived,
            NavigationSection.Reminders => !note.IsTrashed && !note.IsArchived && note.HasReminder,
            NavigationSection.Archive => !note.IsTrashed && note.IsArchived,
            NavigationSection.Trash => note.IsTrashed,
            _ => false
        };

        if (!belongsToSection) return false;
        if (string.IsNullOrWhiteSpace(SearchText)) return true;

        return note.Title.Contains(SearchText, StringComparison.CurrentCultureIgnoreCase)
               || note.Content.Contains(SearchText, StringComparison.CurrentCultureIgnoreCase)
               || note.ChecklistItems.Any(item => item.Text.Contains(SearchText, StringComparison.CurrentCultureIgnoreCase));
    }

    private void TogglePin()
    {
        if (SelectedNote is null) return;
        SelectedNote.IsPinned = !SelectedNote.IsPinned;
    }

    private void Archive()
    {
        if (SelectedNote is null) return;
        SelectedNote.IsArchived = !SelectedNote.IsArchived;
        NotesView.Refresh();
        SelectFirstVisible();
    }

    private void Trash()
    {
        if (SelectedNote is null) return;
        SelectedNote.DeletedAt = DateTimeOffset.Now;
        SelectedNote.IsArchived = false;
        NotesView.Refresh();
        SelectFirstVisible();
    }

    private void Restore()
    {
        if (SelectedNote is null) return;
        SelectedNote.DeletedAt = null;
        NotesView.Refresh();
        SelectFirstVisible();
    }

    private void DeleteForever()
    {
        if (SelectedNote is null) return;
        var deleted = SelectedNote;
        SelectedNote = null;
        Notes.Remove(deleted);
        SelectFirstVisible();
        ScheduleSave();
    }

    private void SetColor(object? parameter)
    {
        if (SelectedNote is null) return;
        if (parameter is NoteColor color)
        {
            SelectedNote.Color = color;
        }
        else if (parameter is string text && Enum.TryParse<NoteColor>(text, out var parsed))
        {
            SelectedNote.Color = parsed;
        }
    }

    private void SelectFirstVisible()
    {
        if (SelectedNote is not null && NotesView.Contains(SelectedNote)) return;
        SelectedNote = NotesView.Cast<NoteViewModel>().FirstOrDefault();
    }

    private void ScheduleSave()
    {
        if (!_isLoaded) return;
        _saveDelay?.Cancel();
        _saveDelay?.Dispose();
        _saveDelay = new CancellationTokenSource();
        var cancellationToken = _saveDelay.Token;
        var snapshot = Notes.Select(note => note.Model.Copy()).ToList();

        _ = Task.Run(async () =>
        {
            try
            {
                await Task.Delay(450, cancellationToken);
                await _store.SaveAsync(snapshot, cancellationToken);
            }
            catch (OperationCanceledException)
            {
            }
        }, cancellationToken);
    }

    private void RaiseCommandStates()
    {
        TogglePinCommand.RaiseCanExecuteChanged();
        ArchiveCommand.RaiseCanExecuteChanged();
        TrashCommand.RaiseCanExecuteChanged();
        RestoreCommand.RaiseCanExecuteChanged();
        DeleteForeverCommand.RaiseCanExecuteChanged();
        SetColorCommand.RaiseCanExecuteChanged();
    }

    private void ApplySort()
    {
        using (NotesView.DeferRefresh())
        {
            NotesView.SortDescriptions.Clear();
            NotesView.SortDescriptions.Add(new SortDescription(nameof(NoteViewModel.IsPinned), ListSortDirection.Descending));
            NotesView.SortDescriptions.Add(SortMode switch
            {
                NoteSortMode.Created => new SortDescription(nameof(NoteViewModel.CreatedAt), ListSortDirection.Descending),
                NoteSortMode.Title => new SortDescription(nameof(NoteViewModel.DisplayTitle), ListSortDirection.Ascending),
                NoteSortMode.Color => new SortDescription(nameof(NoteViewModel.Color), ListSortDirection.Ascending),
                _ => new SortDescription(nameof(NoteViewModel.UpdatedAt), ListSortDirection.Descending)
            });
        }
    }
}
