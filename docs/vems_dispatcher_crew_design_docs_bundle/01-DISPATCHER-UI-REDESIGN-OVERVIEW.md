# Dispatcher UI Redesign Overview

## Purpose
Redesign the dispatcher experience in `apps/web-control` so it behaves like a real EMS operations console rather than a generic internal dashboard.

## Primary users
- Emergency dispatcher
- Shift supervisor
- Operations support coordinator

## Core dispatcher goals
1. See the active board instantly
2. Identify highest-priority incidents without scanning every card
3. Assign crews quickly
4. Track unit status changes in real time
5. Escalate blocked or overdue incidents immediately
6. Work efficiently under time pressure

## Current pain points
- Too much flat information density
- Weak visual hierarchy
- Limited prioritization cues
- Polling updates are not visually meaningful
- Main screen mixes multiple concerns
- Interaction flow is optimized for correctness, not speed

## Redesign objectives
- Create a board-first dispatcher landing experience
- Surface priority, age, and escalation state visually
- Reduce clicks for assignment and status updates
- Make changes obvious when data refreshes
- Preserve existing backend contracts and domain logic
- Keep implementation incremental inside the current app architecture
