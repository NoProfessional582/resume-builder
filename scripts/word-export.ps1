# Converts a .docx to PDF with Microsoft Word and prints {"pages": N} as JSON.
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
  $doc.ExportAsFixedFormat([IO.Path]::GetFullPath($PdfPath), 17) # wdExportFormatPDF
  @{ pages = $pages } | ConvertTo-Json -Compress
}
finally {
  # Word's Close/Quit take by-reference arguments; 0 = wdDoNotSaveChanges.
  if ($doc) { try { $doc.Close([ref]0) | Out-Null } catch { } }
  if ($word) {
    try { $word.Quit([ref]0) | Out-Null } catch { }
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($word)
  }
}
