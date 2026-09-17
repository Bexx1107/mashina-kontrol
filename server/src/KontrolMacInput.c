/**
 * MASHINA KONTROL · Native macOS Input Engine
 * Ultra-low latency CoreGraphics input simulation bridge (<0.1ms).
 * 
 * Part of Mashina Studio (https://mashina-studio.eu)
 * Author: Mashina Studio / Bexx
 * 
 * Compilation on macOS:
 *   clang -framework ApplicationServices -framework CoreGraphics -O2 -o ../bin/kontrol-macinput KontrolMacInput.c
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>

#ifdef __APPLE__
#include <ApplicationServices/ApplicationServices.h>

static CGPoint getCurrentMousePos() {
    CGEventRef event = CGEventCreate(NULL);
    CGPoint cursor = CGEventGetLocation(event);
    CFRelease(event);
    return cursor;
}

static void sendMouseMove(int dx, int dy) {
    CGPoint current = getCurrentMousePos();
    CGPoint target = CGPointMake(current.x + dx, current.y + dy);
    CGEventRef move = CGEventCreateMouseEvent(NULL, kCGEventMouseMoved, target, kCGMouseButtonLeft);
    CGEventSetIntegerValueField(move, kCGMouseEventDeltaX, dx);
    CGEventSetIntegerValueField(move, kCGMouseEventDeltaY, dy);
    CGEventPost(kCGHIDEventTap, move);
    CFRelease(move);
}

static void sendMouseDown(int btn) {
    CGPoint current = getCurrentMousePos();
    CGEventType type = (btn == 2) ? kCGEventRightMouseDown : (btn == 3 ? kCGEventOtherMouseDown : kCGEventLeftMouseDown);
    CGMouseButton mb = (btn == 2) ? kCGMouseButtonRight : (btn == 3 ? kCGMouseButtonCenter : kCGMouseButtonLeft);
    CGEventRef ev = CGEventCreateMouseEvent(NULL, type, current, mb);
    CGEventPost(kCGHIDEventTap, ev);
    CFRelease(ev);
}

static void sendMouseUp(int btn) {
    CGPoint current = getCurrentMousePos();
    CGEventType type = (btn == 2) ? kCGEventRightMouseUp : (btn == 3 ? kCGEventOtherMouseUp : kCGEventLeftMouseUp);
    CGMouseButton mb = (btn == 2) ? kCGMouseButtonRight : (btn == 3 ? kCGMouseButtonCenter : kCGMouseButtonLeft);
    CGEventRef ev = CGEventCreateMouseEvent(NULL, type, current, mb);
    CGEventPost(kCGHIDEventTap, ev);
    CFRelease(ev);
}

static void sendScroll(int delta) {
    CGEventRef scroll = CGEventCreateScrollWheelEvent2(NULL, kCGScrollEventUnitLine, 1, delta, 0, 0);
    CGEventPost(kCGHIDEventTap, scroll);
    CFRelease(scroll);
}

static void sendKey(CGKeyCode key, bool isDown) {
    CGEventRef ev = CGEventCreateKeyboardEvent(NULL, key, isDown);
    CGEventPost(kCGHIDEventTap, ev);
    CFRelease(ev);
}

static void sendUnicodeText(const char* utf8Str) {
    CFStringRef cfStr = CFStringCreateWithCString(NULL, utf8Str, kCFStringEncodingUTF8);
    if (!cfStr) return;
    CFIndex len = CFStringGetLength(cfStr);
    UniChar* buffer = (UniChar*)malloc(sizeof(UniChar) * len);
    if (buffer) {
        CFStringGetCharacters(cfStr, CFRangeMake(0, len), buffer);
        CGEventRef ev = CGEventCreateKeyboardEvent(NULL, 0, true);
        CGEventKeyboardSetUnicodeString(ev, len, buffer);
        CGEventPost(kCGHIDEventTap, ev);
        CFRelease(ev);
        free(buffer);
    }
    CFRelease(cfStr);
}
#endif

int main(int argc, char** argv) {
    setbuf(stdin, NULL);
    setbuf(stdout, NULL);

    printf("KONTROL_MACINPUT_READY\n");
    fflush(stdout);

    char line[1024];
    while (fgets(line, sizeof(line), stdin)) {
        char cmd[32];
        char arg[992];
        cmd[0] = '\0';
        arg[0] = '\0';

        int parsed = sscanf(line, "%31s %[^\r\n]", cmd, arg);
        if (parsed <= 0) continue;

        if (strcmp(cmd, "EXIT") == 0) {
            break;
        }

#ifdef __APPLE__
        if (strcmp(cmd, "MM") == 0) {
            int dx = 0, dy = 0;
            if (sscanf(arg, "%d %d", &dx, &dy) >= 2) {
                sendMouseMove(dx, dy);
            }
        } else if (strcmp(cmd, "MD") == 0) {
            int btn = atoi(arg);
            sendMouseDown(btn > 0 ? btn : 1);
        } else if (strcmp(cmd, "MU") == 0) {
            int btn = atoi(arg);
            sendMouseUp(btn > 0 ? btn : 1);
        } else if (strcmp(cmd, "MW") == 0) {
            int delta = atoi(arg);
            sendScroll(delta);
        } else if (strcmp(cmd, "KD") == 0) {
            int code = atoi(arg);
            sendKey((CGKeyCode)code, true);
        } else if (strcmp(cmd, "KU") == 0) {
            int code = atoi(arg);
            sendKey((CGKeyCode)code, false);
        } else if (strcmp(cmd, "TXT") == 0) {
            sendUnicodeText(arg);
        }
#endif
    }

    return 0;
}
