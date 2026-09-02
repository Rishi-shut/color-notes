using System.Globalization;
using System.Windows;

namespace ColorNotes;

public partial class ReminderDialog : Window
{
    public ReminderDialog(DateTimeOffset? currentReminder)
    {
        InitializeComponent();
        var initial = currentReminder?.LocalDateTime ?? DateTime.Now.Date.AddDays(1).AddHours(9);
        ReminderDate.SelectedDate = initial.Date;
        ReminderTime.Text = initial.ToString("h:mm tt", CultureInfo.CurrentCulture);
        ReminderTime.SelectAll();
    }

    public DateTimeOffset? Reminder { get; private set; }

    private void Save_Click(object sender, RoutedEventArgs e)
    {
        if (ReminderDate.SelectedDate is not DateTime date
            || !DateTime.TryParse(ReminderTime.Text, CultureInfo.CurrentCulture, DateTimeStyles.NoCurrentDateDefault, out var time))
        {
            ValidationText.Text = "Enter a valid date and time, such as 9:30 AM.";
            return;
        }

        var localDateTime = date.Date.Add(time.TimeOfDay);
        if (localDateTime <= DateTime.Now)
        {
            ValidationText.Text = "Choose a time in the future.";
            return;
        }

        Reminder = new DateTimeOffset(localDateTime);
        DialogResult = true;
    }

    private void Cancel_Click(object sender, RoutedEventArgs e) => DialogResult = false;
}

