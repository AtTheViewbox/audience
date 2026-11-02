import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function DescriptionTab({ text }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Description / learning point</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{text}</p>
      </CardContent>
    </Card>
  );
}

export default DescriptionTab;
