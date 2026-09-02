using System.ComponentModel;
using System.Windows;
using System.Windows.Input;
using ColorNotes.Services;
using ColorNotes.ViewModels;

namespace ColorNotes;

public partial class MainWindow : Window
{
    private readonly MainViewModel _viewModel = new(new NoteStore());

    public MainWindow()
    {
        InitializeComponent();
        DataContext = _viewModel;
    }

    private async void Window_Loaded(object sender, RoutedEventArgs e)
    {
        await _viewModel.InitializeAsync();
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

    private void Window_Closing(object? sender, CancelEventArgs e)
    {
        try
        {
            _viewModel.SaveNowAsync().GetAwaiter().GetResult();
        }
        catch
        {
            // Autosave already keeps the latest durable snapshot; shutdown should remain responsive.
        }
    }
}

