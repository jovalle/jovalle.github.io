# jovalle.github.io

Personal blog and portfolio site built with Hugo and deployed to GitHub Pages.

## Features

- 📝 Blog posts with Hugo
- 🎨 PaperMod theme
- 🚀 Automated deployment via GitHub Actions

## Development

### Prerequisites

- Node.js 20+
- Hugo (extended version)
- npm dependencies

### Setup

```bash
# Install dependencies
npm install

# Start Hugo development server
hugo server -D
```

## Automation

### GitHub Actions Workflows

#### 1. **Deploy Hugo Site** ([.github/workflows/pages.yml](.github/workflows/pages.yml))

Runs on every push to `main`:

- Updates GitHub stats
- Generates project thumbnails and descriptions
- Builds Hugo site
- Deploys to GitHub Pages

#### 2. **Update Stats** ([.github/workflows/update-stats.yml](.github/workflows/update-stats.yml))

Runs daily at 00:00 UTC:

- Fetches latest GitHub contribution stats
- Updates repository stars, forks, and languages
- Commits changes back to repository
- See [docs/GITHUB_STATS.md](docs/GITHUB_STATS.md) for details

## Project Structure

```
.
├── .github/workflows/    # GitHub Actions workflows
├── archetypes/           # Hugo content templates
├── assets/               # CSS and static assets
├── content/              # Hugo content (posts, pages)
│   ├── posts/            # Blog posts
│   └── projects.md       # Projects page with stats
├── data/                 # Data files (JSON)
│   └── projects_generated.json
├── docs/                 # Documentation
├── layouts/              # Hugo layout overrides
├── public/               # Built site (generated)
├── scripts/              # Build and automation scripts
├── static/               # Static files
└── themes/PaperMod/      # Hugo theme (submodule)
```

## Configuration

Site configuration is managed through:

- `config.yaml` - Main Hugo configuration
- `config.local.yaml` - Local overrides (gitignored)
- `content/projects.md` - Projects page frontmatter with stats

## Stats Tracking

The site automatically tracks and displays:

- **Total commits**: All contributions across repositories
- **Active days**: Days with at least one commit
- **Best streak**: Longest consecutive days of activity
- **Language skills**: Calculated from repository language usage
- **Repository stats**: Stars, forks, watchers for projects

## Deployment

The site is automatically deployed to GitHub Pages on every push to `main`. The deployment workflow:

1. Updates all stats and metadata
2. Builds the Hugo site
3. Deploys to `https://jovalle.github.io`

## License

ISC

## Author

Jay Ovalle
