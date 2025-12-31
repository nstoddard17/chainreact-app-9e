import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"

export default function TemplateMarketplace() {
  return (
    <div className="container mx-auto py-6">
      <h1 className="text-2xl font-bold mb-6">Template Marketplace</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Data Processing Template</CardTitle>
            <CardDescription>Process and transform data efficiently</CardDescription>
          </CardHeader>
          <CardContent>
            <p>A template for common data processing tasks</p>
          </CardContent>
          <CardFooter>
            <button className="bg-orange-500 text-white px-4 py-2 rounded">Use Template</button>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
