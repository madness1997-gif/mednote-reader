!macro customUnInstallSection
  Section "un.RemoveMedNoteUserData"
    # Silent upgrade/uninstall keeps data unless electron-builder receives the
    # explicit --delete-app-data switch. Interactive uninstall offers the same
    # choice, defaulting to preservation because this directory owns notes,
    # imported PDFs, reader state, and the encrypted Drive refresh token.
    ${IfNot} ${Silent}
      MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_DEFBUTTON2 \
        "Bạn có muốn xóa toàn bộ dữ liệu MedNote Reader trên máy này không?$\r$\n$\r$\nChọn Không để giữ note, PDF và thiết lập cho lần cài lại sau. Dữ liệu đã xóa không thể khôi phục nếu chưa đồng bộ Google Drive." \
        IDNO preserveMedNoteUserData

      ${If} $installMode == "all"
        SetShellVarContext current
      ${EndIf}
      RMDir /r "$APPDATA\${APP_FILENAME}"
      !ifdef APP_PRODUCT_FILENAME
        RMDir /r "$APPDATA\${APP_PRODUCT_FILENAME}"
      !endif
      !ifdef APP_PACKAGE_NAME
        RMDir /r "$APPDATA\${APP_PACKAGE_NAME}"
      !endif
      ${If} $installMode == "all"
        SetShellVarContext all
      ${EndIf}

      preserveMedNoteUserData:
    ${EndIf}
  SectionEnd
!macroend
