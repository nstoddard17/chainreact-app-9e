"use client"

import { useState, useEffect } from "react"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"

const DashboardContent = () => {
  const [isLoading, setIsLoading] = useState(true)
  const [data, setData] = useState<any>(null)
  const supabase = createClientComponentClient()

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true)
      try {
        const { data, error } = await supabase
          .from("your_table") // Replace 'your_table' with your actual table name
          .select("*")

        if (error) {
          console.error("Error fetching data:", error)
        } else {
          setData(data)
        }
      } catch (error) {
        console.error("Unexpected error:", error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [supabase])

  if (isLoading) {
    return <div>Loading...</div>
  }

  if (!data) {
    return <div>No data available.</div>
  }

  return (
    <div>
      <h1>Dashboard Content</h1>
      <ul>
        {data.map((item: any) => (
          <li key={item.id}>{item.name}</li> // Adjust based on your table structure
        ))}
      </ul>
    </div>
  )
}

export default DashboardContent
