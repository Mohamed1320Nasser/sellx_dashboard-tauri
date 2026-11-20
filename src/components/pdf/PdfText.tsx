/**
 * react-pdf has no bidi: a line mixing Arabic with numbers, dates or Latin names comes out
 * in the wrong order ("192026/11/", ":هاتف", the house number at the end of an address).
 * These pieces lay such lines out word group by word group, right to left.
 */
import React from "react";
import { View, Text } from "@react-pdf/renderer";

type Align = "flex-start" | "flex-end" | "center";

/**
 * Arabic words with dates, numbers and Latin names inside ("من 01/11/2026 حتى 20/11/2026",
 * "12 شارع التحرير", "Mohamed Nasser"): words of the same script stay one piece,
 * dates are laid out left to right
 */
export const WordsText: React.FC<{ text: string; style: any; align?: Align; nowrap?: boolean }> = ({
  text,
  style,
  align = "flex-end",
  nowrap = false,
}) => {
  const groups: { kind: "date" | "latin" | "ar"; text: string }[] = [];
  for (const w of String(text || "").split(/\s+/).filter(Boolean)) {
    const kind = /^\d+\/\d+\/\d+$/.test(w) ? "date" : /^[A-Za-z0-9+(]/.test(w) ? "latin" : "ar";
    const last = groups[groups.length - 1];
    if (last && last.kind === kind && kind !== "date") last.text += ` ${w}`;
    else groups.push({ kind, text: w });
  }
  return (
    <View style={{ flexDirection: "row-reverse", flexWrap: nowrap ? "nowrap" : "wrap", columnGap: 3, alignSelf: align }}>
      {groups.map((g, i) =>
        g.kind === "date" ? (
          <View key={i} style={{ flexDirection: "row" }}>
            {g.text.split(/(\/)/).filter(Boolean).map((p, j) => (
              <Text key={j} style={style}>
                {p}
              </Text>
            ))}
          </View>
        ) : (
          <Text key={i} style={style}>
            {g.text}
          </Text>
        )
      )}
    </View>
  );
};

/** "هاتف 0100…" / "الرقم الضريبي 123…": an Arabic label and a value side by side (no colon: it lands on the wrong side) */
export const LabelValue: React.FC<{ label: string; value: string; style: any; align?: Align }> = ({
  label,
  value,
  style,
  align = "flex-end",
}) => (
  <View style={{ flexDirection: "row-reverse", columnGap: 4, alignSelf: align }}>
    <Text style={style}>{label}</Text>
    <WordsText text={value} style={style} />
  </View>
);
