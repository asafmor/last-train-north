# Codex CLI Quick Guide

A practical cheat sheet for the OpenAI Codex CLI. Source: [Codex developer commands](https://learn.chatgpt.com/docs/developer-commands?surface=cli).

## 1. Sign in

```bash
codex login                                        # opens the browser (ChatGPT OAuth)
codex login --device-auth                          # headless / SSH / WSL: device-code flow
printenv OPENAI_API_KEY | codex login --with-api-key
codex login status                                 # exit code 0 = logged in (handy in scripts)
codex logout
```

## 2. Interactive sessions (TUI)

```bash
codex                                              # start the TUI
codex "explain the structure of src/"              # start with a prompt
codex -m gpt-6.1-sol "refactor style.css"          # pick a model
codex -i mockup.png "build this layout in index.html"   # attach images
codex --search "what's new in Vite 7?"             # live web search (default is cached)
codex -C ~/dev/other-repo                          # run in another directory
codex --add-dir ../shared-lib                      # grant write access to an extra dir
```

### Safe defaults for local work

```bash
codex --sandbox workspace-write --ask-for-approval on-request
codex -s read-only "audit this repo for XSS"       # look but don't touch
```

Sandbox modes: `read-only` · `workspace-write` · `danger-full-access`.
Avoid `--yolo` (`--dangerously-bypass-approvals-and-sandbox`) unless you're in a throwaway VM/container.
Need write access to one more directory? Use `--add-dir`, not `danger-full-access`.

### Resume and fork

```bash
codex resume                     # pick from saved sessions
codex resume --last              # most recent session in this directory
codex resume --last --all        # most recent from any directory
codex resume my-session-name
codex fork --last                # branch the last session into a new chat
```

### Housekeeping

```bash
codex archive <SESSION>          # hide from the picker, keep transcript
codex unarchive <SESSION>
codex delete <SESSION_UUID> --force
```

## 3. Non-interactive / scripting (`codex exec`)

`codex exec` (alias `codex e`) runs a task to completion without prompting you.

```bash
codex exec "add JSDoc comments to src/*.js"
codex exec -s workspace-write "fix failing lint errors"
git diff | codex exec -                                  # prompt from stdin
codex exec -o summary.md "summarize recent changes"      # save final message to file
codex exec --json "run the tests and fix failures" > events.jsonl   # NDJSON event stream
codex exec --skip-git-repo-check "tidy up this folder"   # outside a git repo
codex exec --ephemeral "quick question"                  # don't persist the session
codex exec resume --last "now add tests for that"        # continue the previous exec run
```

Structured output validated against a JSON Schema:

```bash
codex exec --output-schema schema.json -o result.json "list all TODOs in src/"
```

CI recipe (progress as JSON + readable summary):

```bash
codex exec --json -o codex-summary.md -s workspace-write "fix the build" > codex-events.jsonl
```

## 4. Code review (`codex review`)

Pick exactly one target:

```bash
codex review --uncommitted                   # staged + unstaged + untracked
codex review --base main                     # current branch vs main
codex review --commit abc1234 --title "Add train timetable"
codex review "focus on accessibility in index.html"      # custom instructions
echo "check for perf regressions" | codex review -
```

## 5. Configuration on the fly

```bash
codex -c model_reasoning_effort=high "design a caching layer"   # any config.toml key
codex -p work                                # layer ~/.codex/work.config.toml
codex --enable some_feature --disable other  # one-off feature flags
codex features list                          # see flags + effective state
codex features enable some_feature           # persist to config.toml
codex --oss --local-provider ollama          # use a local model
```

## 6. MCP servers

```bash
codex mcp add context7 -- npx -y @upstash/context7-mcp          # stdio server
codex mcp add github --env GITHUB_TOKEN=$GITHUB_TOKEN -- npx -y @modelcontextprotocol/server-github
codex mcp add docs --url https://mcp.example.com/mcp --bearer-token-env-var DOCS_TOKEN   # HTTP
codex mcp list
codex mcp get context7 --json
codex mcp login docs            # OAuth (HTTP servers only)
codex mcp remove context7
```

## 7. Plugins

```bash
codex plugin marketplace add owner/repo          # GitHub shorthand, git URL, or local dir
codex plugin marketplace list
codex plugin add my-plugin@my-marketplace
codex plugin list --available --json
codex plugin remove my-plugin
```

## 8. Codex Cloud

```bash
codex cloud                                  # interactive picker
codex cloud exec --env ENV_ID "add dark mode"
codex cloud exec --env ENV_ID --attempts 3 "optimize render loop"   # best-of-N
codex cloud list --limit 10 --json
codex apply TASK_ID                          # apply a cloud task's diff locally
```

## 9. Utilities

```bash
codex doctor --summary                       # diagnose install/auth/config issues
codex completion bash >> ~/.bashrc           # shell completion (bash|zsh|fish|power-shell|elvish)
codex update                                 # self-update
codex debug models                           # raw model catalog as JSON
codex sandbox -- ls /                        # run a command under Codex's sandbox
codex execpolicy check --rules ~/.codex/rules/default.rules --pretty -- rm -rf build
```

## 10. Inside the TUI

### Shortcuts

| Key | Action |
| --- | --- |
| `@` | Fuzzy-search a file and insert its path |
| `!cmd` | Run a shell command (respects sandbox/approvals) |
| `Enter` (while working) | Inject instructions into the current turn |
| `Tab` (while working) | Queue a follow-up for the next turn |
| `Up` / `Down` | Draft history |
| `Ctrl+R` | Search prompt history |
| `Ctrl+O` | Copy the latest output |
| `Esc Esc` (empty composer) | Edit previous message and fork from there |
| `Ctrl+C` | Exit |

### Handy slash commands

| Command | Use it to |
| --- | --- |
| `/init` | Generate an `AGENTS.md` for the repo |
| `/model` | Switch model / reasoning effort |
| `/fast` | Toggle Fast mode |
| `/plan` | Switch to plan mode |
| `/goal` | Set or view a task goal |
| `/permissions` | Change what Codex can do without asking |
| `/review` | Review the working tree |
| `/diff` | Show the git diff, including untracked files |
| `/mention` | Attach a file or folder to the chat |
| `/compact` | Summarize the chat to free up context |
| `/new`, `/clear` | Start a fresh chat |
| `/resume`, `/fork` | Continue or branch a saved chat |
| `/side` | Quick side question without derailing the main chat |
| `/mcp`, `/apps`, `/plugins`, `/skills` | Browse tools and extensions |
| `/status`, `/usage` | Session info, token/rate-limit usage |
| `/ps`, `/stop` | Inspect / stop background terminals |
| `/copy` | Copy the latest response |
| `/import` | Import Claude Code or Cursor setup |
| `/exit`, `/quit` | Leave |

## Typical workflows

```bash
# Start a feature safely
codex -s workspace-write -a on-request "add a departure board component in src/"

# Review before committing
codex review --uncommitted

# Fix CI and capture a summary
codex exec -s workspace-write -o fix.md "run npm test and fix failures"

# Pick up where you left off
codex resume --last
```
