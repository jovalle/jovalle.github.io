---
date: "2025-10-20"
title: "Go Links @ Home"
draft: false
tags: ["traefik", "networking", "homelab"]
---

## The Problem

Typing full URLs gets tedious. `status.example.com` is a mouthful when you just
want to check your dashboard. What if you could just type `go/status` in your browser
and instantly get there?

## The Solution: Go Links

Go links (also known as "go/" shortcuts) have been a staple at companies like Google
for years. The concept is simple:

- Type `go/something` in your browser
- Get redirected to `https://something.example.com`

This is typically achieved through DNS search domains combined with HTTP redirects.

<div class="fun-fact">
I helped develop a "Smartlink" solution during my time at Cisco to implement go-links
with auto-correction in the intranet.
</div>

## How It Works

The magic happens in two parts:

### 1. DNS Search Domain

Configure your LAN to use a search domain `example.com`. When you type `go/status`
in your browser:

- Your browser searches for `go.example.com`
- DNS resolves `go.example.com` to your Traefik instance
- Request arrives: `http://go.example.com/status`

### 2. Traefik Path-Based Redirects

Traefik intercepts the request and applies custom middleware to parse the path and
construct a new URL:

- **`$1`** = subdomain (extracted from path)
- **`$2`** = subpath on destination (optional trailing path)

For example:

- `go/status` → `https://status.example.com`
- `go/grafana/dashboards` → `https://grafana.example.com/dashboards`

### Flow Diagram

{{< mermaid >}}
sequenceDiagram
  participant Browser
  participant DNS
  participant Traefik
  participant Destination

  Browser->>Browser: User types "go/status"
  Browser->>DNS: Lookup "go.example.com"
  DNS-->>Browser: Returns Traefik IP
  Browser->>Traefik: GET http://go.example.com/status
  Traefik->>Traefik: Parse path: $1="status", $2=""
  Traefik->>Traefik: Construct: https://status.example.com
  Traefik-->>Browser: 302 Redirect to https://status.example.com
  Browser->>Destination: GET https://status.example.com
  Destination-->>Browser: Return page
{{< /mermaid >}}

## Implementation

### Step 1: DNS Configuration

Here is relevant code snippet for my AdGuard Home configuration:

```yaml
filtering:
...
  rewrites:
    - domain: "go.example.com"
      answer: "192.168.0.2"
    - domain: "go"
      answer: "go.example.com"
```

### Step 2: Traefik Middleware

```yaml
http:
  middlewares:
    go-slug:
      redirectRegex:
        permanent: false
        regex: "^https?://go(?:\\.example\\.com)?/([^/?#]+)(.*)$"
        replacement: "https://$1.example.com$2"
  routers:
    go:
      entryPoints:
        - web
        - websecure
      middlewares:
        - go-slug
      priority: 100
      rule: "Host(`go`) || Host(`go.example.com`)"
      service: "noop"
  services:
    noop:
      loadBalancer:
        servers:
          - url: "http://127.0.0.1:65535"
```

### Step 3: Common Shortcuts

Now instead of typing full URLs or bookmarking everything, you can simply:

- Type `go/status` → `https://status.example.com`
- Type `go/grafana` → `https://grafana.example.com`

Clean, fast, and elegant.

## Future State: Custom Rule Engine

While the current implementation works great for internal services following the
`subdomain.example.com` pattern, there are cases where you need more flexibility:

### The Limitation

Not every shortcut fits the pattern. For example:

- `go/google` → `https://google.com` (external site)
- `go/docs/k8s` → `https://kubernetes.io/docs` (custom mapping)
- `go/gh/jovalle` → `https://github.com/jovalle` (specific profile)
- `go/technis/pull/24` → `https://github.com/jovalle/technis/pull/24` (parameterized)

These don't map to `*.example.com` subdomains and require custom rules.

### The Solution: Go Link Service

The plan is to build a dedicated go-links application that sits behind Traefik:

{{< mermaid >}}
flowchart LR
    A[Browser: go/google] --> B{Traefik}
    B --> C{Custom Rule?}
    C -->|Yes| D[Go Links App]
    C -->|No| E[Pattern Match]
    E --> F[https://$1.example.com/$2]
    D --> G[Lookup in Database]
    G --> H[https://google.com]
{{< /mermaid >}}

### Features

#### Custom Mappings

- Database or config-backed rules
- Support for external URLs
- Integrations (parameterized)

#### Fallback Logic

- Try custom rules first
- Fall back to pattern-based redirects
- 404 page with suggestions for unmapped shortcuts

#### Management Interface

- Web UI to add/edit/delete shortcuts
- Analytics dashboard (most used links, 404s)
- Bulk import/export
- API for programmatic management

#### Advanced Features

- Short-lived temporary links
- Access control (team-specific shortcuts)
- Link expiration
- A/B testing for redirects

## Alternatives

There are browser extensions ([Golinks](https://www.golinks.io/) and [Trotto](https://www.trot.to/))
that accomplish must of the same thing but require manually adding links. There's
also Tailscale's [golink](https://github.com/tailscale/golink) but only works within
a [tailnet](https://tailscale.com/kb/1136/tailnet) and still needs to be manually
populated.

## References

- [Traefik Documentation](https://doc.traefik.io/traefik/)
- [GoLinks](https://www.golinks.io)
- [Trotto](https://www.trot.to/)
- [tailscale/golink](https://github.com/tailscale/golink)
