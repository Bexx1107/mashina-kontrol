# How to Push This Repository to GitHub

This folder (`S:\mashina-kontrol\0RELEASE\Github-Repo`) is a clean, production-ready Git repository with all unnecessary scratch files, logs, and build artifacts excluded.

---

## Step 1: Create an Empty Repository on GitHub
1. Go to [github.com/new](https://github.com/new).
2. Set **Repository name** to: `mashina-kontrol` (or whatever name you like).
3. Set visibility to **Public** (or **Private**).
4. **IMPORTANT**: Do **NOT** check "Add a README file", "Add .gitignore", or "Choose a license" (this folder already includes all of them).
5. Click **Create repository**.
6. Copy your repository URL (e.g. `https://github.com/your-username/mashina-kontrol.git`).

---

## Step 2: Push Using Git Terminal (Quickest)

Open PowerShell or Command Prompt, and run these 3 commands:

```bash
cd S:\mashina-kontrol\0RELEASE\Github-Repo

git remote add origin https://github.com/your-username/mashina-kontrol.git
git branch -M main
git push -u origin main
```

*(Replace `your-username` with your actual GitHub username).*

---

## Step 3: Or Push Using GitHub Desktop

1. Open **GitHub Desktop**.
2. Click **File ➔ Add Local Repository...** (or press <kbd>Ctrl</kbd> + <kbd>O</kbd>).
3. Choose path: `S:\mashina-kontrol\0RELEASE\Github-Repo`.
4. Click **Publish repository** to push it straight to your GitHub account!

---

## Automatic Multi-Platform Releases (CI/CD)

Whenever you want to release a new version with automated Windows `.exe` and macOS `.dmg` builds:
```bash
git tag v2.1.0
git push origin v2.1.0
```
GitHub Actions will automatically run on cloud runners, build both platforms, and attach the download files to your repository's Releases page!
