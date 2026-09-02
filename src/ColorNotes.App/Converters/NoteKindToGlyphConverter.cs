using System.Globalization;
using System.Windows.Data;
using ColorNotes.Models;

namespace ColorNotes.Converters;

public sealed class NoteKindToGlyphConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture) =>
        value is NoteKind.Checklist ? "☑" : "✎";

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) =>
        throw new NotSupportedException();
}
