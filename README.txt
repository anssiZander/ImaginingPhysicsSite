Imagining Physics static site

This is a static HTML/CSS/JavaScript site for Imagining Physics. It is intended to be deployed from the repository root with GitHub Pages.

Pages included:
- index.html: landing page with featured links
- about.html: background and introduction
- videos.html: long-form YouTube videos
- shorts.html: YouTube Shorts
- interactive.html: GitHub Pages / browser-based demos
- shadertoy.html: Shadertoy shader links
- games.html: Game of Coriolis and VR version links

Local preview:
- Open this folder in VS Code and run index.html with the Live Server extension, or open index.html directly in a browser.

GitHub Pages deployment for the existing repository:
1. Review local changes, then commit and push them to the existing GitHub repository.
2. On GitHub, open the repository settings.
3. Go to Settings -> Pages.
4. Set Source to "Deploy from a branch".
5. Set Branch to main and folder to / (root), then save.
6. Set the custom domain to imaginingphysics.com.
7. In Cloudflare DNS, point the domain to GitHub Pages.
8. Add A records for the root domain:
   - Type: A, Name: @, Content: 185.199.108.153
   - Type: A, Name: @, Content: 185.199.109.153
   - Type: A, Name: @, Content: 185.199.110.153
   - Type: A, Name: @, Content: 185.199.111.153
9. Add a CNAME record for www:
   - Type: CNAME, Name: www, Content: anssizander.github.io
10. Wait for GitHub to validate the custom domain.
11. Enable Enforce HTTPS in Settings -> Pages after validation is complete.

Public repo safety checklist:
- Confirm no secrets, API keys, passwords, access tokens, or private keys are present.
- Confirm no .env files, local config files, private documents, tax/accounting files, or unpublished notes are present.
- Confirm no private email addresses, phone numbers, home addresses, or personal identifiers are present.
- Confirm links intentionally point only to public resources.
- Confirm image metadata does not contain private location, device, author, or file-path information.
- Confirm git history does not contain removed private data before making the repository public.
- Confirm the CNAME file contains only imaginingphysics.com.
