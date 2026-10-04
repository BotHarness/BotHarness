# Channel sidebar drag evidence

Real installed DSH 0.2.0-rc.1 Web Profile, 1440 × 900, the same canonically created Sidebar Editor QA PersonaBot DM. Before uses main 647fbe95 before the fix; After uses this PR. No model reply or permission mutation is needed.

Open the DM, choose the top gear → Edit sidebar, drag Memory files by its handle into the lower half of Sessions, and hold the mouse button. Before shows neither order preview nor insertion indicator; After moves the rows immediately and shows the insertion line. Release, choose Done, then reload to review persistence. First/last gap images cover both boundaries; the English image uses the same interaction.

Mounted regression runs through the production editor. Real browser automation additionally verified row-label drops, first/last positions, outside rollback, Done/reload and Cancel/default. Escape cancellation was sent as a DOM keyboard event during a real pointer drag because CDP key presses do not cancel Chromium's native drag session; mounted coverage also verifies Escape outside the handle and listener disposal.

Accepted follow-up: edit mode removes expansion chevrons and allows dragging labels and row background as well as the handle. Whole-row movement uses a thresholded pointer gesture with capture and the same stable gap/draft engine; native HTML5 handles and keyboard moves remain supported. Real mouse tests verify both starts, both end positions, hover-to-release agreement, cancellation and persistence. Moving-child native dragleave is ignored while the pointer remains inside the sidebar. The whole-row images were captured in a fixed theme during each gesture.
