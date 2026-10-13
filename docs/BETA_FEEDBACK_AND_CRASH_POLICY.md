# Beta feedback and crash-reporting policy

## Current policy

Ministry of Elsewhere collects no telemetry and uploads no crash report. A crash may
still be recorded locally by macOS under the operating system's own diagnostics
settings, but the app neither reads nor transmits that report.

Beta feedback is writer-initiated. Testers may open an issue in the
[project's GitHub issue tracker](https://github.com/haddeeann/two-hundred-crappy-words/issues)
or use a publisher-announced support channel when one is established.
They should describe the action, expected result, actual result, Ministry version,
and macOS version. They should not paste manuscript or lore text unless they
deliberately want to share it.

## Safe diagnostic sharing

The in-app **Export Content-Free Diagnostics…** action produces a complete preview
before Save As. It contains only allowlisted app/runtime versions and coarse session
states. It contains no general logs. Writers should inspect it before attaching it to
an issue. Attachment is a separate manual action outside the app.

Apple crash reports and screenshots can contain usernames, file paths, window titles,
or visible prose. Before sharing one, a writer should remove or obscure anything they
do not want public. The product does not currently provide an automated crash-log
redactor and should not imply that the content-free diagnostic replaces a crash
report when a native crash needs investigation.

## Triage and retention

Public issue content follows GitHub's policies and remains visible until its author
or a repository maintainer changes it. A future private support address needs a
separate retention and access policy before it is advertised. Maintainers should ask
for the minimum additional evidence needed, avoid requesting project archives by
default, and never ask a writer to publish credentials, recovery stores, or a whole
Application Support directory.

## Future crash services

No hosted crash or analytics service may be enabled merely as a packaging step. A
future proposal must name the processor, data fields, retention, regions, cost,
consent flow, opt-out/delete behavior, and symbol-handling process and must be
approved before code or credentials are added.
