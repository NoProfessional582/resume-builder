# Converts a .docx to PDF with Microsoft Word and prints its layout as JSON:
#   {"pages": N, "lines": N, "lastPageFill": 0..1}
# lastPageFill is how far down the last page the text ends (0 = top, 1 = bottom margin).
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\word-export.ps1 -InputPath in.docx -PdfPath out.pdf
#
# Uses its own hidden Word process (never the user's open Word windows) and quits it afterwards.

param(
  [Parameter(Mandatory = $true)][string]$InputPath,
  [Parameter(Mandatory = $true)][string]$PdfPath
)
$ErrorActionPreference = 'Stop'

$word = $null
$doc = $null
try {
  $word = New-Object -ComObject Word.Application # starts a separate WINWORD.EXE /Automation
  $word.Visible = $false
  $word.DisplayAlerts = 0 # wdAlertsNone

  # Documents.Open(FileName, ConfirmConversions, ReadOnly, AddToRecentFiles)
  $doc = $word.Documents.Open((Resolve-Path $InputPath).Path, $false, $true, $false)
  $doc.Repaginate()
  $pages = $doc.ComputeStatistics(2) # wdStatisticPages
  $lines = $doc.ComputeStatistics(1) # wdStatisticLines

  # Where the last character sits on the last page.
  $fill = $null
  try {
    $end = $doc.Content
    $end.Collapse([ref]0) # wdCollapseEnd
    $y = [double]$end.Information(6) # wdVerticalPositionRelativeToPage, in points
    $setup = $doc.Sections.Item($doc.Sections.Count).PageSetup
    $usable = $setup.PageHeight - $setup.TopMargin - $setup.BottomMargin
    # 0.0 / 1.0, not 0 / 1: with integer arguments PowerShell picks the integer Min/Max and truncates.
    if ($usable -gt 0 -and $y -ge 0) {
      $fill = [Math]::Round([Math]::Min(1.0, [Math]::Max(0.0, [double](($y - $setup.TopMargin) / $usable))), 3)
    }
  } catch { $fill = $null }

  $doc.ExportAsFixedFormat([IO.Path]::GetFullPath($PdfPath), 17) # wdExportFormatPDF
  @{ pages = $pages; lines = $lines; lastPageFill = $fill } | ConvertTo-Json -Compress
}
finally {
  # Word's Close/Quit take by-reference arguments; 0 = wdDoNotSaveChanges.
  if ($doc) { try { $doc.Close([ref]0) | Out-Null } catch { } }
  if ($word) {
    try { $word.Quit([ref]0) | Out-Null } catch { }
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($word)
  }
}
