Attribute VB_Name = "ModulPDF"
Option Explicit

' Yeni PDF makrosu. Eski SatýalmaFormuPDF (Module1) yerine gecer.
' Buton atamasi "SatýalmaFormuPDF" adina bagli oldugu icin ad AYNEN korunmustur.

Private Const FORM_SHEET As String = "Talep Form"
Private Const MAX_STF As Long = 8

Private Function CoverSheetName() As String
    CoverSheetName = ChrW(214) & "n Yaz" & ChrW(305)          ' On Yazi
End Function

Private Function SummarySheetName() As String
    SummarySheetName = "Talep" & ChrW(214) & "zet"            ' TalepOzet
End Function

Sub SatýalmaFormuPDF()
    Dim wsForm As Worksheet
    Dim nStf As Long, i As Long
    Dim outDir As String, baseName As String, stamp As String
    Dim coverFile As String, formFile As String
    Dim grp() As String
    Dim curStep As String, curSheet As String, curPath As String
    Dim errNum As Long, errDesc As String
    Dim oldEvents As Boolean, oldScreen As Boolean
    Dim a2 As Variant, a19 As Variant, doneMsg As String

    On Error GoTo Hata

    curStep = "Talep Form okunuyor"
    Set wsForm = ThisWorkbook.Worksheets(FORM_SHEET)
    a2 = wsForm.Range("A2").Value
    If IsError(a2) Then a2 = 0
    If a2 = 0 Then
        MsgBox "PDF formlarýný oluþturabilmek için, baþlýklarý Kýrmýzý ile iþaretli tüm alanlarý eksiksiz doldurmanýz gerekiyor....", vbExclamation
        Exit Sub
    End If

    oldEvents = Application.EnableEvents
    oldScreen = Application.ScreenUpdating
    Application.EnableEvents = False
    Application.ScreenUpdating = False

    ' Eski makrodaki M2:N2 -> E1:F1 ve M1 -> G1 kopyalamasi (formul olarak)
    curStep = "E1/F1/G1 hücreleri güncelleniyor"
    curSheet = FORM_SHEET
    wsForm.Range("E1").FormulaR1C1 = wsForm.Range("M2").FormulaR1C1
    wsForm.Range("F1").FormulaR1C1 = wsForm.Range("N2").FormulaR1C1
    wsForm.Range("G1").FormulaR1C1 = wsForm.Range("M1").FormulaR1C1

    ' Kac STF sayfasi var?
    a19 = wsForm.Range("A19").Value
    If IsError(a19) Then a19 = 0
    nStf = CLng(a19)
    If nStf < 0 Then nStf = 0
    If nStf > MAX_STF Then nStf = MAX_STF

    ' Dosya adlari: Excel TEXT() yerine VBA Format (dil bagimsiz)
    stamp = Format(Date, "yymmdd") & "_" & Format(Time, "hhnn")
    baseName = SafeName(CStr(wsForm.Range("C4").Value))
    coverFile = baseName & "_Sat" & ChrW(305) & "nAlma" & ChrW(214) & "nYaz" & ChrW(305) & "_" & stamp
    formFile = baseName & "_Sat" & ChrW(305) & "nAlmaTalepFormu_" & stamp

    curStep = "Kayýt klasörü aranýyor"
    outDir = SaveDir()

    ' Sayfa yapisi (yazici iletisimi kapaliyken, hizli)
    curStep = "Sayfa yapýsý ayarlanýyor"
    SetPrintComm False
    curSheet = CoverSheetName()
    ApplySetup ThisWorkbook.Worksheets(curSheet), True
    If nStf > 0 Then
        For i = 1 To nStf
            curSheet = "STF_" & Format(i, "00")
            ApplySetup ThisWorkbook.Worksheets(curSheet), False
        Next i
        curSheet = SummarySheetName()
        ApplySetup ThisWorkbook.Worksheets(curSheet), False
    End If
    SetPrintComm True

    ' 1) On Yazi
    curStep = "Ön Yazý PDF"
    curSheet = CoverSheetName()
    curPath = UniquePath(outDir, coverFile)
    ThisWorkbook.Worksheets(curSheet).Select
    ActiveSheet.ExportAsFixedFormat Type:=xlTypePDF, Filename:=curPath, _
        Quality:=xlQualityStandard, IncludeDocProperties:=True, _
        IgnorePrintAreas:=False, OpenAfterPublish:=False

    ' 2) STF_01..STF_n + TalepOzet (tek PDF)
    If nStf > 0 Then
        ReDim grp(0 To nStf)
        For i = 1 To nStf
            grp(i - 1) = "STF_" & Format(i, "00")
        Next i
        grp(nStf) = SummarySheetName()
        curStep = "Talep Formu PDF"
        curSheet = Join(grp, ", ")
        curPath = UniquePath(outDir, formFile)
        ThisWorkbook.Worksheets(grp).Select
        ActiveSheet.ExportAsFixedFormat Type:=xlTypePDF, Filename:=curPath, _
            Quality:=xlQualityStandard, IncludeDocProperties:=True, _
            IgnorePrintAreas:=False, OpenAfterPublish:=False
        doneMsg = "Ön Yazý ve " & nStf & " Sayfa Satýn Alma Talep Formu þu klasöre kaydedildi:" & vbCrLf & outDir
    Else
        doneMsg = "Herhangi Ürün/Hizmet girilmediði için, sadece Ön Yazý þu klasöre kaydedildi:" & vbCrLf & outDir
    End If

    RestoreState wsForm, oldEvents, oldScreen
    MsgBox doneMsg, vbInformation
    Exit Sub

Hata:
    errNum = Err.Number
    errDesc = Err.Description
    RestoreState wsForm, oldEvents, oldScreen
    MsgBox "PDF oluþturulamadý." & vbCrLf & vbCrLf & _
           "Hata no : " & errNum & vbCrLf & _
           "Açýklama: " & errDesc & vbCrLf & _
           "Adým    : " & curStep & vbCrLf & _
           "Sayfa   : " & curSheet & vbCrLf & _
           "Yol     : " & curPath, vbCritical, "SatýalmaFormuPDF"
End Sub

Private Sub RestoreState(ByVal wsForm As Worksheet, ByVal oldEvents As Boolean, ByVal oldScreen As Boolean)
    On Error Resume Next
    SetPrintComm True
    Application.EnableEvents = True
    Application.ScreenUpdating = True
    If Not wsForm Is Nothing Then
        wsForm.Select
        wsForm.Range("C3").Select
    End If
End Sub

Private Sub SetPrintComm(ByVal v As Boolean)
    On Error Resume Next
    Application.PrintCommunication = v
End Sub

' Bazi ozellikler (ornegin PrintQuality=600) belirli yazicilarda 1004 verir;
' bu yuzden tek tek, hata yutularak uygulanir. Kritik olan ihracat adiminda hata raporlanir.
Private Sub ApplySetup(ByVal ws As Worksheet, ByVal isCover As Boolean)
    On Error Resume Next
    With ws.PageSetup
        .LeftHeader = "": .CenterHeader = "": .RightHeader = ""
        If isCover Then
            .LeftFooter = "": .CenterFooter = "": .RightFooter = ""
            .LeftMargin = Application.InchesToPoints(0.78740157480315)
        Else
            .LeftFooter = ChrW(304) & "TYO-F002-R2"
            .CenterFooter = "&P/&N"
            .RightFooter = "25.07.2023"
            .LeftMargin = Application.InchesToPoints(0.393700787401575)
        End If
        .RightMargin = Application.InchesToPoints(0.196850393700787)
        .TopMargin = Application.InchesToPoints(0.590551181102362)
        .BottomMargin = Application.InchesToPoints(0.196850393700787)
        .HeaderMargin = 0
        .FooterMargin = 0
        .PrintHeadings = False
        .PrintGridlines = False
        .PrintComments = xlPrintNoComments
        .PrintQuality = 600
        .CenterHorizontally = Not isCover
        .CenterVertically = False
        .Orientation = xlPortrait
        .Draft = False
        .PaperSize = xlPaperA4
        .Order = xlDownThenOver
        .BlackAndWhite = False
        If isCover Then
            .Zoom = 100
        Else
            .Zoom = False
            .FitToPagesWide = 1
            .FitToPagesTall = 1
        End If
        .PrintErrors = xlPrintErrorsDisplayed
        .OddAndEvenPagesHeaderFooter = False
        .DifferentFirstPageHeaderFooter = False
        .ScaleWithDocHeaderFooter = False
        .AlignMarginsHeaderFooter = False
    End With
End Sub

' Dosya adindaki gecersiz karakterleri temizler
Private Function SafeName(ByVal s As String) As String
    Dim bad As Variant, i As Long
    bad = Array("\", "/", ":", "*", "?", """", "<", ">", "|", vbCr, vbLf, vbTab)
    For i = LBound(bad) To UBound(bad)
        s = Replace(s, bad(i), "_")
    Next i
    s = Trim$(s)
    Do While Len(s) > 0
        If Right$(s, 1) = "." Or Right$(s, 1) = " " Then s = Left$(s, Len(s) - 1) Else Exit Do
    Loop
    If Len(s) = 0 Then s = "Talep"
    If Len(s) > 120 Then s = Left$(s, 120)
    SafeName = s
End Function

' Yazilabilir ilk klasor: Masaustu -> OneDrive Masaustu -> (yerelse) calisma kitabi klasoru -> %TEMP%
Private Function SaveDir() As String
    Dim c(1 To 7) As String, i As Long, p As String
    On Error Resume Next
    c(1) = CreateObject("WScript.Shell").SpecialFolders("Desktop")
    c(2) = Cat(Environ("USERPROFILE"), "\Desktop")
    c(3) = Cat(Environ("OneDriveCommercial"), "\Desktop")
    c(4) = Cat(Environ("OneDrive"), "\Desktop")
    c(5) = Cat(Environ("OneDriveConsumer"), "\Desktop")
    If IsLocalPath(ThisWorkbook.Path) Then c(6) = ThisWorkbook.Path
    c(7) = Environ("TEMP")
    On Error GoTo 0
    For i = 1 To 7
        p = c(i)
        Do While Len(p) > 3 And Right$(p, 1) = "\"
            p = Left$(p, Len(p) - 1)
        Loop
        If Len(p) > 0 Then
            If DirWritable(p) Then
                SaveDir = p
                Exit Function
            End If
        End If
    Next i
    Err.Raise 76, "SaveDir", "Yazýlabilir bir klasör bulunamadý (Masaüstü, OneDrive, çalýþma kitabý klasörü, TEMP denendi)."
End Function

Private Function Cat(ByVal base As String, ByVal tail As String) As String
    If Len(base) > 0 Then Cat = base & tail
End Function

Private Function IsLocalPath(ByVal p As String) As Boolean
    If Len(p) < 3 Then Exit Function
    IsLocalPath = (Mid$(p, 2, 2) = ":\") Or (Left$(p, 2) = "\\")
End Function

Private Function DirWritable(ByVal p As String) As Boolean
    Dim f As Integer, t As String
    On Error GoTo Fail
    If Len(Dir(p, vbDirectory)) = 0 Then Exit Function
    t = p & "\~pdftest.tmp"
    f = FreeFile
    Open t For Output As #f
    Close #f
    Kill t
    DirWritable = True
    Exit Function
Fail:
    On Error Resume Next
    Close #f
End Function

' Tam yolu uretir; ayni adli PDF acik/kilitliyse ad sonuna saniye ekler. 250 karakter sinirini korur.
Private Function UniquePath(ByVal dirPath As String, ByVal nm As String) As String
    Dim maxName As Long, p As String, f As Integer
    maxName = 240 - Len(dirPath)
    If maxName < 20 Then maxName = 20
    If Len(nm) > maxName Then nm = Left$(nm, maxName)
    p = dirPath & "\" & nm & ".pdf"
    If Len(Dir(p)) > 0 Then
        On Error Resume Next
        f = FreeFile
        Open p For Binary Access Write Lock Read Write As #f
        If Err.Number <> 0 Then
            Err.Clear
            p = dirPath & "\" & nm & "_" & Format(Time, "ss") & ".pdf"
        Else
            Close #f
        End If
        On Error GoTo 0
    End If
    UniquePath = p
End Function
