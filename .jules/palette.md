## 2024-05-14 - Shadow DOM Focus States
**Learning:** Custom UI elements within a closed Shadow DOM often lack native `:focus-visible` browser outlines unless explicitly defined, significantly impacting keyboard navigation accessibility.
**Action:** Add a global `:focus-visible` reset and explicitly apply `outline` to custom interactive classes (`.ac-btn`, `[role="switch"]`, etc.) in the base reset styles.
