# Crew Mobile Interaction Flows

## Flow 1 — Receive and acknowledge
1. Crew opens app
2. Current assignment screen shows active call immediately
3. Large primary button allows Acknowledge
4. Status updates without navigating away

## Flow 2 — Transition through scene states
1. En route
2. On scene
3. Depart scene
4. At receiving site
5. Handover complete

Each state should:
- expose only the next primary action
- avoid showing unrelated controls
- confirm status update clearly
