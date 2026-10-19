' Converts a .docx to PDF using Word, via late-bound COM.
' PowerShell failed with TYPE_E_CANTLOADLIBRARY because it loads the interop
' assembly; cscript talks to the IDispatch interface directly and usually works
' where that does not.
Option Explicit

Dim src, dst, word, doc, fso
Set fso = CreateObject("Scripting.FileSystemObject")

If WScript.Arguments.Count < 2 Then
  WScript.Echo "usage: cscript word2pdf.vbs <input.docx> <output.pdf>"
  WScript.Quit 2
End If

src = fso.GetAbsolutePathName(WScript.Arguments(0))
dst = fso.GetAbsolutePathName(WScript.Arguments(1))

If Not fso.FileExists(src) Then
  WScript.Echo "input not found: " & src
  WScript.Quit 3
End If

On Error Resume Next
Set word = CreateObject("Word.Application")
If Err.Number <> 0 Then
  WScript.Echo "could not start Word: " & Err.Description
  WScript.Quit 4
End If
Err.Clear

word.Visible = False
word.DisplayAlerts = 0
Err.Clear

Set doc = word.Documents.Open(src, False, True)
If Err.Number <> 0 Then
  WScript.Echo "could not open document: " & Err.Description
  word.Quit
  WScript.Quit 5
End If
Err.Clear

' 17 = wdExportFormatPDF
doc.ExportAsFixedFormat dst, 17
If Err.Number <> 0 Then
  WScript.Echo "export failed: " & Err.Description
  doc.Close 0
  word.Quit
  WScript.Quit 6
End If
Err.Clear

doc.Close 0
word.Quit

If fso.FileExists(dst) Then
  WScript.Echo "wrote " & dst & " (" & fso.GetFile(dst).Size & " bytes)"
  WScript.Quit 0
Else
  WScript.Echo "export reported success but no file was written"
  WScript.Quit 7
End If
