# Jira Analysis MCP

A powerful Model Context Protocol (MCP) server for seamless Jira integration with AI assistants like Claude. Features advanced search capabilities, intelligent pod aliases, comprehensive ticket analysis, and full API support.

## ✨ Features

### Core Capabilities
- **🔍 Advanced Search**: Full pagination support - automatically fetches ALL results (no 100 issue limit)
- **🎯 Smart Pod Aliases**: Use shorthand names (`workflow`, `growth`, `platform`) instead of full pod names
- **📊 Intelligent Ticket Analysis**: Comprehensive analysis with automatic filtering of AI-generated comments
- **📝 Issue Management**: Create, read, update, and search Jira issues with flexible field filtering
- **💬 Comments**: Add, delete, and manage comments with automatic markdown-to-ADF conversion
- **📎 Attachments**: Upload, download, and manage issue attachments
- **🎨 Rich Formatting**: Automatic conversion of markdown to Atlassian Document Format (ADF)
  - Code blocks with syntax highlighting
  - Inline code, lists (bullet/numbered)
  - Headings, bold, italic, strikethrough
  - Links and line breaks

### What Makes This Different
- **No Pagination Headaches**: Automatically handles Jira's pagination - you get all results, not just the first page
- **Pod-Aware**: Built-in understanding of common pod structures with smart aliasing
- **AI-Ready**: Filters AI-generated comments from analysis for cleaner insights
- **Production-Ready**: Handles Jira's latest API endpoints (no deprecated APIs)

## 🚀 Quick Start

### Installation

```bash
git clone https://github.com/sheikhaamir/jira-analysis-mcp.git
cd jira-analysis-mcp
npm install
npm run build
```

### Configuration

Create a `.env` file in the root directory:

```env
JIRA_URL=https://your-domain.atlassian.net
JIRA_EMAIL=your-email@example.com
JIRA_API_TOKEN=your-api-token
```

**Getting a Jira API Token:**
1. Visit https://id.atlassian.com/manage-profile/security/api-tokens
2. Click "Create API token"
3. Copy the token and add it to your `.env` file

### Usage with Claude Desktop

#### macOS
Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "jira": {
      "command": "node",
      "args": ["/absolute/path/to/jira-analysis-mcp/build/index.js"],
      "env": {
        "JIRA_URL": "https://your-domain.atlassian.net",
        "JIRA_EMAIL": "your-email@example.com",
        "JIRA_API_TOKEN": "your-api-token"
      }
    }
  }
}
```

#### Windows
Edit `%APPDATA%\Claude\claude_desktop_config.json` with the same structure, using Windows paths.

### Usage with Cursor

Create or edit `~/.cursor/mcp_settings.json`:

```json
{
  "mcpServers": {
    "jira": {
      "command": "node",
      "args": ["/absolute/path/to/jira-analysis-mcp/build/index.js"],
      "env": {
        "JIRA_URL": "https://your-domain.atlassian.net",
        "JIRA_EMAIL": "your-email@example.com",
        "JIRA_API_TOKEN": "your-api-token"
      }
    }
  }
}
```

## 📖 Usage Examples

### Smart Pod Aliases

Use simple shorthand names instead of full pod names:

| Alias | Full Pod Name |
|-------|---------------|
| `workflow`, `pod1`, `pod 1` | Pod 1 Workflow |
| `growth`, `pod2`, `pod 2` | Pod 2 Growth |
| `platform` | Platform Pod |
| `siteops`, `site ops` | Pod SiteOps |
| `ai` | AI Pod |
| `ds`, `design` | DS Pod |
| `scale` | Scale Pod |

**Example:**
```jql
Pod = "workflow" AND created >= 2025-12-01
```
Automatically expands to:
```jql
Pod = "Pod 1 Workflow" AND created >= 2025-12-01
```

### Search Issues

```javascript
// Get all issues (no pagination limit)
search_issues({
  jql: 'Pod = "workflow" AND created >= 2025-12-01 AND project = SS2T',
  maxResults: 500
})

// Search by status
search_issues({
  jql: 'project = MYPROJ AND status = "In Progress"',
  maxResults: 100
})
```

### Analyze Tickets

```javascript
// Get comprehensive ticket analysis
analyze_ticket({ issueKey: 'SS2T-13091' })

// Returns structured data:
// - What customer saw (description, attachments)
// - How it happened (probable cause, root cause, regression status)
// - How it was fixed (resolution type, current status)
// - Timeline and customer context
```

### Create Issues

```javascript
create_issue({
  project: 'MYPROJ',
  summary: 'Bug: Login page not loading',
  description: 'Users are unable to access the login page',
  issueType: 'Bug'
})
```

### Add Comments

```javascript
add_comment({
  issueKey: 'MYPROJ-123',
  comment: 'This has been fixed in production'
})
```

## 🛠️ Available Tools

### Issue Management
- `get_issue` - Get details of a specific issue
- `search_issues` - Search issues with JQL (supports pod aliases, full pagination)
- `create_issue` - Create a new issue
- `update_issue` - Update an existing issue

### Analysis
- `analyze_ticket` - Get comprehensive ticket analysis (filters AI comments)
- `get_comprehensive_issue` - Get ALL details including custom fields, comments, attachments

### Comments
- `add_comment` - Add a comment (with optional attachments)
- `delete_comment` - Delete a comment

### Attachments
- `get_attachments` - List all attachments for an issue
- `download_attachment` - Download an attachment to disk
- `add_attachment` - Upload an attachment to an issue

## 🎯 Advanced Features

### Full Pagination Support
Unlike basic Jira clients, this server automatically handles pagination:
- Fetches ALL results across multiple pages
- No manual token management
- No 100-result limits

### Intelligent Ticket Analysis
The `analyze_ticket` tool provides:
- Automatic filtering of AI-generated comments
- Structured data extraction (probable cause, root cause, regression status)
- Timeline analysis
- Customer context (organization, tier, platform)

### Pod-Aware Architecture
Built-in understanding of pod structures:
- Automatic alias expansion
- Support for multiple pod naming conventions
- Easy to extend with new pods

## 🔧 Development

### Build
```bash
npm run build
```

### Watch Mode
```bash
npm run watch
```

### Project Structure
```
jira-analysis-mcp/
├── src/
│   ├── index.ts          # MCP server implementation
│   └── jira-client.ts    # Jira API client with pagination
├── build/                # Compiled JavaScript
├── .env                  # Your Jira credentials
└── package.json
```

## 📝 Requirements

- Node.js 18 or higher
- Jira Cloud account with API access
- Valid Jira API token

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## 📄 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

Built with the [Model Context Protocol SDK](https://github.com/modelcontextprotocol/sdk) by Anthropic.

## 📞 Support

For issues, questions, or suggestions, please open an issue on GitHub.

---

**Note**: After installation or updates, restart your AI assistant (Claude/Cursor) to load the latest server build.
