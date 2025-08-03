---
title: Card Component - Flexible Container for Content
date: 2023-08-03
component: Card
---

# Card Component

The Card component provides a flexible container for displaying content with consistent styling and structure. It offers a collection of sub-components for different sections of a card.

## Usage

```tsx
import { 
  Card, 
  CardHeader, 
  CardFooter, 
  CardTitle, 
  CardDescription, 
  CardContent 
} from "@/components/ui/card"

export default function ExampleCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Card Title</CardTitle>
        <CardDescription>Card description text</CardDescription>
      </CardHeader>
      <CardContent>
        <p>Main card content goes here</p>
      </CardContent>
      <CardFooter>
        <p>Footer content with actions</p>
      </CardFooter>
    </Card>
  )
}
```

## Component API

### Card

The root component that wraps the entire card.

**Props:**
- All `div` HTML attributes
- `className`: Additional CSS classes to apply

### CardHeader

Container for the card's title and description.

**Props:**
- All `div` HTML attributes
- `className`: Additional CSS classes to apply

### CardTitle

For displaying the card's title.

**Props:**
- All `div` HTML attributes
- `className`: Additional CSS classes to apply

### CardDescription

For displaying supplementary text below the title.

**Props:**
- All `div` HTML attributes
- `className`: Additional CSS classes to apply

### CardContent

Container for the main content of the card.

**Props:**
- All `div` HTML attributes
- `className`: Additional CSS classes to apply

### CardFooter

Container for action items or additional information at the bottom of the card.

**Props:**
- All `div` HTML attributes
- `className`: Additional CSS classes to apply

## Styling

The Card components use Tailwind CSS for styling:

- `Card`: Rounded borders with a subtle shadow
- `CardHeader`: Padding and flex column layout
- `CardTitle`: Large, bold text
- `CardDescription`: Smaller, muted text
- `CardContent`: Padding with no top padding (continues from header)
- `CardFooter`: Padding with flex layout for items

## Examples

### Basic Card

```tsx
<Card>
  <CardHeader>
    <CardTitle>Account Balance</CardTitle>
    <CardDescription>View your current balance and transactions</CardDescription>
  </CardHeader>
  <CardContent>
    <p className="text-2xl font-bold">$4,258.00</p>
  </CardContent>
  <CardFooter>
    <Button variant="outline">View History</Button>
    <Button className="ml-auto">Add Funds</Button>
  </CardFooter>
</Card>
```

### Card with Custom Styling

```tsx
<Card className="bg-primary text-primary-foreground">
  <CardHeader>
    <CardTitle className="text-white">Premium Membership</CardTitle>
    <CardDescription className="text-primary-foreground/80">
      You are currently on the premium plan
    </CardDescription>
  </CardHeader>
  <CardContent>
    <p>Access to all premium features and priority support.</p>
  </CardContent>
  <CardFooter>
    <Button variant="secondary">Manage Subscription</Button>
  </CardFooter>
</Card>
```