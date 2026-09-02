using System.Globalization;
using System.Windows.Data;
using System.Windows.Media;
using ColorNotes.Models;

namespace ColorNotes.Converters;

public sealed class NoteColorToBrushConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        var color = value is NoteColor noteColor ? noteColor : NoteColor.Yellow;
        return new SolidColorBrush(color switch
        {
            NoteColor.Coral => Color.FromRgb(255, 229, 218),
            NoteColor.Rose => Color.FromRgb(255, 226, 235),
            NoteColor.Grape => Color.FromRgb(239, 228, 255),
            NoteColor.Ocean => Color.FromRgb(219, 239, 255),
            NoteColor.Mint => Color.FromRgb(218, 246, 231),
            NoteColor.Slate => Color.FromRgb(230, 235, 241),
            _ => Color.FromRgb(255, 242, 189)
        });
    }

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) =>
        throw new NotSupportedException();
}

