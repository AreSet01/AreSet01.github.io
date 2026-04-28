# Locked Posts

This is a display-level lock for a static Astro site. It hides selected posts until the visitor enters the right password. Because GitHub Pages/GitHub Actions produces static files, this is not suitable for truly confidential content.

## Create a password hash

```bash
npm run hash:password -- your-password-here
```

Copy the printed hash into the post frontmatter.

## Lock a post

```markdown
---
title: "Private note"
description: "Only visible after unlock"
pubDate: 2026-04-28
tags: ["private"]
draft: false
locked: true
passwordHash: "paste-the-sha256-hash-here"
passwordHint: "optional hint"
---

Protected content goes here.
```

`passwordHint` is optional. If `locked` is omitted or set to `false`, the article behaves normally.