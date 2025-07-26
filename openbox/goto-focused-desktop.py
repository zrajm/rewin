#!/usr/bin/env python3
#
# This monitors windows in X, and if the flag 'DEMANDS_ATTENTION' (aka
# 'urgent') is set, then switches to the desktop of that window. This flag is
# set by Openbox (and other window managers obeying the EWMH standard) instead
# of switching to the desktop, to avoid disrupting the user experience --
# though I find it rather cumbersome, and would much prefer a direct switch to
# the desktop in question (hence this script).
#
# This is mostly a workaround (since Openbox can not be configured to do this
# automatically) for Firefox since it allows the address bar tab search ('%'
# prefix) to switch to a different window, even if that window is on a
# different desktop. And this also allows my Rewin plugin to switch to other
# desktops.
#
# /zrajm, 2025-07-25

from Xlib import X, display, protocol, Xatom

d = display.Display()
root = d.screen().root

NET_CLIENT_LIST = d.intern_atom('_NET_CLIENT_LIST')
NET_CURRENT_DESKTOP = d.intern_atom('_NET_CURRENT_DESKTOP')
NET_WM_DESKTOP = d.intern_atom('_NET_WM_DESKTOP')
NET_WM_STATE = d.intern_atom('_NET_WM_STATE')
NET_WM_STATE_DEMANDS_ATTENTION = d.intern_atom('_NET_WM_STATE_DEMANDS_ATTENTION')

###############################################################################

# Get all top-level windows
def get_windows():
    prop = root.get_full_property(NET_CLIENT_LIST, X.AnyPropertyType)
    return prop.value if prop else []

# Watch all current top-level windows
def watch_all():
    try:
        for win_id in get_windows():
            win = d.create_resource_object('window', win_id)
            win.change_attributes(event_mask=X.PropertyChangeMask)
    except:
        pass

# Check if a window has the "demands attention" flag
def has_attention(win_id):
    try:
        win = d.create_resource_object('window', win_id)
        prop = win.get_full_property(NET_WM_STATE, X.AnyPropertyType)
        if prop and NET_WM_STATE_DEMANDS_ATTENTION in prop.value:
            return True
    except:
        pass
    return False

# Get desktop number for specified window.
def get_window_desktop(win_id):
    win = d.create_resource_object('window', win_id)
    try:
        prop = win.get_full_property(NET_WM_DESKTOP, Xatom.CARDINAL)
        if prop:
            return prop.value[0]
    except:
        pass
    return None  # unknown or unset

# Switch to specified desktop.
def switch_desktop(desktop_index):
    root.send_event(
        protocol.event.ClientMessage(
            window=root,
            client_type=NET_CURRENT_DESKTOP,
            data=(32, [desktop_index, X.CurrentTime, 0, 0, 0]),
            format=32,
        ),
        event_mask=X.SubstructureRedirectMask | X.SubstructureNotifyMask,
    )
    d.flush()

###############################################################################

# Initial setup: Watch existing windows & updates to the window list.
watch_all()
root.change_attributes(event_mask=X.PropertyChangeMask)

while True:
    e = d.next_event()
    if e.type == X.PropertyNotify:
        #print(e.window.id, "\t", d.get_atom_name(e.atom))  # DEBUG

        # If window has 'urgent' flag, switch to that desktop.
        if e.atom == NET_WM_STATE and has_attention(e.window.id):
            desktop = get_window_desktop(e.window.id)
            switch_desktop(desktop)

        # Windows created or destroyed.
        elif e.atom == NET_CLIENT_LIST:
            watch_all()

#[eof]
