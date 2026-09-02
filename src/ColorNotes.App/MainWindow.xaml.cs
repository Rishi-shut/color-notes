using System.ComponentModel;
using System.Windows;
using System.Windows.Input;
using System.Windows.Threading;
using Microsoft.Win32;
using ColorNotes.Services;
using ColorNotes.ViewModels;

namespace ColorNotes;

public partial class MainWindow : Window
{
    private readonly MainViewModel _viewModel = new(new NoteStore());
    private readonly NoteBackupService _backupService = new();
    private readonly DispatcherTimer _reminderTimer = new() { Interval = TimeSpan.FromSeconds(30) };
    private readonly HashSet<Guid> _shownReminders = [];
    private bool _isClosing;

    public MainWindow()
    {
        InitializeComponent();
        DataContext = _viewModel;
        _viewModel.NoteCreated += _ => Dispatcher.BeginInvoke(() =>
        {
            TitleBox.Focus();
            TitleBox.SelectAll();
        }, DispatcherPriority.Input);
        _reminderTimer.Tick += (_, _) => ShowDueReminders();
    }

    private async void Window_Loaded(object sender, RoutedEventArgs e)
    {
        await _viewModel.InitializeAsync();
        ShowDueReminders();
        _reminderTimer.Start();
    }

    private void Reminder_Click(object sender, RoutedEventArgs e)
    {
        if (_viewModel.SelectedNote is not { } note) return;
        var dialog = new ReminderDialog(note.ReminderAt) { Owner = this };
        if (dialog.ShowDialog() == true)
        {
            note.ReminderAt = dialog.Reminder;
        }
    }

    private void ShowDueReminders()
    {
        var due = _viewModel.Notes
            .Where(note => !note.IsTrashed && note.ReminderAt is not null && note.ReminderAt <= DateTimeOffset.Now)
            .Where(note => _shownReminders.Add(note.Id))
            .ToList();

        foreach (var note in due)
        {
            Activate();
            MessageBox.Show(this,
                string.IsNullOrWhiteSpace(note.Title) ? "Your note is due." : note.Title,
                "Color Notes reminder",
                MessageBoxButton.OK,
                MessageBoxImage.Information);
            note.ReminderAt = null;
        }
    }

    private void BackupMenu_Click(object sender, RoutedEventArgs e)
    {
        if (sender is FrameworkElement element && element.ContextMenu is { } menu)
        {
            menu.PlacementTarget = element;
            menu.IsOpen = true;
        }
    }

    private async void ExportNotes_Click(object sender, RoutedEventArgs e)
    {
        var dialog = new SaveFileDialog
        {
            Title = "Export Color Notes backup",
            Filter = "Color Notes backup (*.colornotes)|*.colornotes",
            FileName = $"ColorNotes-{DateTime.Now:yyyy-MM-dd}.colornotes",
            AddExtension = true,
            DefaultExt = ".colornotes"
        };

        if (dialog.ShowDialog(this) != true) return;
        try
        {
            await _backupService.ExportAsync(dialog.FileName, _viewModel.Notes.Select(note => note.Model));
            MessageBox.Show(this, "Your notes were exported successfully.", "Backup complete",
                MessageBoxButton.OK, MessageBoxImage.Information);
        }
        catch (Exception exception)
        {
            MessageBox.Show(this, $"The backup could not be created.\n\n{exception.Message}", "Backup failed",
                MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private async void ImportNotes_Click(object sender, RoutedEventArgs e)
    {
        var dialog = new OpenFileDialog
        {
            Title = "Import Color Notes backup",
            Filter = "Color Notes backup (*.colornotes)|*.colornotes|JSON files (*.json)|*.json",
            CheckFileExists = true
        };

        if (dialog.ShowDialog(this) != true) return;
        try
        {
            var notes = await _backupService.ImportAsync(dialog.FileName);
            var result = _viewModel.MergeImportedNotes(notes);
            await _viewModel.SaveNowAsync();
            MessageBox.Show(this, $"Import complete: {result.Added} added, {result.Updated} updated.", "Backup restored",
                MessageBoxButton.OK, MessageBoxImage.Information);
        }
        catch (Exception exception)
        {
            MessageBox.Show(this, $"This backup could not be imported.\n\n{exception.Message}", "Import failed",
                MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private void Window_PreviewKeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.F && Keyboard.Modifiers == ModifierKeys.Control)
        {
            SearchBox.Focus();
            SearchBox.SelectAll();
            e.Handled = true;
        }
    }

    private async void Window_Closing(object? sender, CancelEventArgs e)
    {
        if (_isClosing) return;

        e.Cancel = true;
        _isClosing = true;
        _reminderTimer.Stop();
        try
        {
            await _viewModel.SaveNowAsync();
        }
        catch
        {
            // Autosave already keeps the latest durable snapshot; shutdown should remain responsive.
        }
        finally
        {
            Close();
        }
    }
}
