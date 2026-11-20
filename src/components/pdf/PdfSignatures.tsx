import React from "react";
import { View, Text, StyleSheet } from "@react-pdf/renderer";
import { LabelValue, WordsText } from "./PdfText";

const styles = StyleSheet.create({
  wrap: { flexDirection: "row-reverse", columnGap: 32, paddingTop: 30 },
  col: { flex: 1, borderTopWidth: 1, borderTopColor: "#94a3b8", paddingTop: 5, alignItems: "center" },
  label: { fontSize: 8, color: "#94a3b8", textAlign: "center", marginBottom: 4 },
  name: { fontSize: 9.5, fontWeight: "bold", color: "#0f172a", textAlign: "center" },
  line: { fontSize: 8, color: "#475569", textAlign: "center" },
});

export interface SignatureSide {
  label: string;
  name?: string;
  address?: string | null;
  phone?: string | null;
}

/**
 * The two signature areas at the end of A4 documents: who signs for the customer / supplier
 * (name and phone) and the company stamp (name, address, phone)
 */
export const PdfSignatures: React.FC<{ party: SignatureSide; company: SignatureSide; style?: any }> = ({
  party,
  company,
  style,
}) => (
  <View style={[styles.wrap, style]} wrap={false}>
    {[party, company].map((side, i) => (
      <View key={i} style={styles.col}>
        <Text style={styles.label}>{side.label}</Text>
        {side.name ? <WordsText text={side.name} style={styles.name} align="center" /> : null}
        {side.address ? <WordsText text={side.address} style={styles.line} align="center" /> : null}
        {side.phone ? <LabelValue label="هاتف" value={side.phone} style={styles.line} align="center" /> : null}
      </View>
    ))}
  </View>
);
