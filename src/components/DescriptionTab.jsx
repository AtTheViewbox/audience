import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import MarkdownText from "./MarkdownText.jsx";

function DescriptionTab({ text }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Description / learning point</CardTitle>
      </CardHeader>
      <CardContent>
        <MarkdownText text={text} />
      </CardContent>
    </Card>
  );
}

export default DescriptionTab;
