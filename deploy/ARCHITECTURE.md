# Architecture

This document describes the final recommended architecture for a personal NAS-based mem9 deployment.

## Overview

```text
OpenClaw (1..N)
  -> mnemo-server on NAS :8888
  -> TiDB Cloud

Browser
  -> dashboard-web on NAS :3100
  -> dashboard-api on NAS :3101
  -> mnemo-server on NAS :8888
  -> TiDB Cloud
```

## Goals

- Keep the NAS workload light
- Preserve vector-backed retrieval quality
- Support multiple OpenClaw instances sharing one memory pool
- Provide a local dashboard for search, inspection, audit, and export
- Avoid relying on local LLM analysis for core functionality

## Components

### 1. OpenClaw

OpenClaw instances are the memory producers and consumers.

Responsibilities:

- write new memories
- query memories for recall
- share a tenant memory pool across multiple agents

Each OpenClaw instance should use:

- the same `apiUrl`
- the same `apiKey` for the same project
- a stable `agentId`

### 2. mnemo-server

`mnemo-server` is the central API layer.

Port:

- `8888`

Responsibilities:

- memory CRUD
- search
- imports
- session-related endpoints
- tenant-scoped memory access

It should run on the NAS, but remain lightweight. It should not be used as a public-facing service.

### 3. TiDB Cloud

TiDB Cloud is the primary database and retrieval engine.

Responsibilities:

- persistent memory storage
- vector search support
- better recall quality than plain local MySQL

Why it stays remote:

- preserves vector-backed retrieval
- avoids local database maintenance burden
- keeps the NAS focused on application services

### 4. dashboard-api

`dashboard-api` is the local management API for the dashboard.

Port:

- `3101`

Responsibilities:

- proxy dashboard requests to `mnemo-server`
- provide aggregate stats
- log dashboard and API actions into local SQLite
- export audit logs as CSV and JSON
- apply local request rate limiting

This layer should remain internal to the NAS / Docker network where possible.

### 5. dashboard-web

`dashboard-web` is the frontend UI.

Port:

- `3100`

Responsibilities:

- memory list
- search
- summary stats
- memory detail view
- audit page and export actions

Deployment style:

- built static assets
- served by Nginx
- proxies `/your-memory/api/*` to `dashboard-api`

## Ports

- `8888`: `mnemo-server`
- `3100`: `dashboard-web`
- `3101`: `dashboard-api`

Recommended access pattern:

- browser uses `3100`
- OpenClaw uses `8888`
- `3101` stays internal when possible

## Data Flow

### Memory write flow

```text
OpenClaw
  -> mnemo-server
  -> TiDB Cloud
```

### Memory recall flow

```text
OpenClaw
  -> mnemo-server
  -> TiDB Cloud vector / keyword retrieval
  -> mnemo-server response
```

### Dashboard flow

```text
Browser
  -> dashboard-web
  -> dashboard-api
  -> mnemo-server
  -> TiDB Cloud
```

### Audit flow

```text
Browser / dashboard action
  -> dashboard-api
  -> SQLite audit_logs
```

## Security Boundary

### Internal-facing services

- `mnemo-server`
- `dashboard-api`

### Browser-facing service

- `dashboard-web`

### Security recommendations

- keep the deployment inside the LAN
- do not expose `8888` or `3101` publicly
- use Basic Auth on `dashboard-api` if needed
- do not rely on public reverse proxy or `80/443`
- do not replace TiDB Cloud endpoint with a custom database domain

## Why TiDB Cloud Instead of Local MySQL

This deployment intentionally keeps TiDB Cloud as the database backend.

Reasons:

- vector retrieval quality matters more than local-only simplicity
- plain local MySQL would reduce search quality
- some repository paths in the project are TiDB-centric
- keeping the database managed reduces NAS operational burden

Practical tradeoff:

- local MySQL is simpler as storage
- TiDB Cloud is stronger as a retrieval system

For this use case, retrieval quality is the more important requirement.

## Scope Intentionally Excluded

The deployment does not treat local LLM analysis as a core requirement.

Intentionally excluded or deprioritized:

- LLM-based memory analysis
- graph-style insight panels
- local small-model summarization as a required path
- advanced semantic dashboards that add operational complexity

The goal is stability and useful recall, not maximal feature count.

## Current Supported Product Surface

- memory sync across OpenClaw instances
- list and search
- summary stats
- agent distribution
- memory detail panel
- audit log export
- local dashboard management

## Operational Recommendations

### Backups

- TiDB Cloud database backups / exports
- local SQLite audit database backups
- uploaded file directory backups

### Monitoring

- `mnemo-server` health endpoint
- `mnemo-server` metrics endpoint
- dashboard-api request failures
- TiDB connection failures

### Cleanup

- remove low-value memories regularly
- inspect duplicate or noisy memories
- keep the dashboard focused on management rather than heavy analysis

## Final Design Principle

This deployment follows a simple split:

- TiDB Cloud provides retrieval strength
- `mnemo-server` provides a unified memory API
- the NAS dashboard provides local management and audit
- OpenClaw provides ongoing memory production and usage

That split is the reason the system remains practical for long-term personal use.
