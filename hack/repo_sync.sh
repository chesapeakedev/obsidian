#!/bin/bash
# sync your local sapling stack with upstream

# good debuggable default for bash
set -e

# pass lint before interacting with upstream
make lint 

# rebase upstream over local
sl pull --rebase -d master 

# check if there are any local commits that need to be restacked and pushed
#
# FIXME: currently doesn't check for commits "off of main". for example:
# @  b8adc7c536  Friday at 13:09  nicholas.newman90  remote/main
# ╷  fix sync make target in tonite app
# ╷
# ╷ o  a70da9e9e7  Jul 24 at 08:52  mooch
# ╭─╯  broken hono setup
# │
# o  539261be2e  Jul 19 at 14:11  mooch
# ╷  tonite: add feature rule file for dynamic splash
# ╷
# o  f8dbc419ac  Jul 18 at 22:52  mooch  location-input-upgrade tonite-ui-polish
# ╷  (vibe)tonite: create location-input.tsx
# ╷
# ╷ x  f702f298ad [Rebased to f8dbc419acb2]  Jul 16 at 10:08  mooch  remote/location-input-upgrade
# ╭─╯  (vibe)tonite: create location-input.tsx
# │
# o  8523bbe11a  Jul 15 at 23:00  mooch
# │  tonite: revert prod auth callback for now
# ~
#
# the above example returns true on the conditional because of a70da9e9e7 and 
# f702f298ad, which is not really the intent of the script. the intent is to
# ensure that when you have some local commits you'd like to stack on top of
# the linear history, you can easily pull the latest commits from the remote
# and rebase them under the local commits you are looking to merge.
#
# the problem with the current setup is that commits like a70da9e9e7 don't have
# anything to do with this workflow (unless you're trying to rebase multiple 
# local anonymous branches at the same time but that seems like a bad pattern),
# but they trigger the restack anyway
draft_commits=$(sl log --rev "draft()" 2>/dev/null)
if [ -n "$draft_commits" ]; then
  sl restack
  sl push --to master
fi
