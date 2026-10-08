import React, { useEffect, useRef } from 'react';
import {
  KeyboardAvoidingView, Platform, ScrollView, StyleSheet,
  type ScrollViewProps,
} from 'react-native';

/** A bounded, scrollable form: Android's resized window is the available height.
 * Android RN scrollsChildToFocus keeps inputs visible; web repeats focus scrolling
 * after the visual viewport changes (including software-keyboard resizing).
 */
export function KeyboardForm({ children, contentContainerStyle, ...props }: ScrollViewProps) {
  const scroll = useRef<ScrollView>(null);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const reveal = () => {
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && scroll.current &&
          (scroll.current as unknown as HTMLElement).contains(focused)) {
        focused.scrollIntoView({ block: 'nearest' });
      }
    };
    window.addEventListener('resize', reveal);
    window.visualViewport?.addEventListener('resize', reveal);
    return () => {
      window.removeEventListener('resize', reveal);
      window.visualViewport?.removeEventListener('resize', reveal);
    };
  }, []);
  return <ScrollView
    {...props}
    ref={scroll}
    style={[styles.scroll, props.style]}
    contentContainerStyle={[styles.content, contentContainerStyle]}
    keyboardShouldPersistTaps="handled"
    keyboardDismissMode={Platform.OS === 'android' ? 'none' : 'on-drag'}
    scrollsChildToFocus
  >{children}</ScrollView>;
}

export function KeyboardFrame({ children, style }: React.PropsWithChildren<{ style?: import('react-native').StyleProp<import('react-native').ViewStyle> }>) {
  return <KeyboardAvoidingView
    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    style={[styles.frame, style]}
  >{children}</KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  frame: { flex: 1 },
  scroll: { flexShrink: 1, minHeight: 0 },
  content: { paddingBottom: 24 },
});
