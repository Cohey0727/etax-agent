import { agentToolLabel } from "@etax/shared";
import { StyleSheet, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { ChatMessage } from "@/api";
import { AppText } from "@/components/AppText";
import { Chip } from "@/components/Chip";
import { colors, radius, space, springs } from "@/theme";

/** 会話の吹き出し一覧（使ったツールと添付も添える）。 */
export function MessageBubbles({ items }: { items: ChatMessage[] }) {
  return (
    <View style={{ gap: space.sm }}>
      {items.map((message, index) => (
        <Animated.View
          key={index}
          entering={FadeInDown.springify()
            .damping(springs.bouncy.damping)
            .stiffness(springs.bouncy.stiffness)}
          style={[styles.bubble, message.role === "user" ? styles.user : styles.assistant]}
        >
          <AppText size="md">{message.content}</AppText>
          {message.attachments && message.attachments.length > 0 ? (
            <View style={styles.chips}>
              {message.attachments.map((att) => (
                <Chip key={att.name} label={att.name} tone="accent" />
              ))}
            </View>
          ) : null}
          {message.toolCalls && message.toolCalls.length > 0 ? (
            <View style={styles.chips}>
              {message.toolCalls.map((tc, i) => (
                <Chip key={`${tc.name}-${i}`} label={agentToolLabel(tc.name)} tone="muted" />
              ))}
            </View>
          ) : null}
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.md, maxWidth: "88%", gap: space.xs },
  user: { backgroundColor: colors.accentSoft, alignSelf: "flex-end", borderBottomRightRadius: 4 },
  assistant: {
    backgroundColor: colors.surface,
    borderColor: colors.lineSoft,
    borderWidth: 1,
    alignSelf: "flex-start",
    borderBottomLeftRadius: 4,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
});
