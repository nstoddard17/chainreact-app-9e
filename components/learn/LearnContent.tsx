"use client"

import AppLayout from "@/components/layout/AppLayout"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { BookOpen, Video, FileText, Award, Clock, Star, Play, CheckCircle, ArrowRight } from "lucide-react"

const courses = [
  {
    id: 1,
    title: "Workflow Automation Fundamentals",
    description: "Learn the basics of creating and managing automated workflows",
    duration: "2 hours",
    lessons: 12,
    difficulty: "Beginner",
    progress: 75,
    thumbnail: "/placeholder.svg?height=200&width=300&text=Workflow+Fundamentals",
    instructor: "Sarah Chen",
    rating: 4.8,
    students: 1234,
  },
  {
    id: 2,
    title: "Advanced Integration Patterns",
    description: "Master complex integrations and data transformations",
    duration: "4 hours",
    lessons: 18,
    difficulty: "Advanced",
    progress: 30,
    thumbnail: "/placeholder.svg?height=200&width=300&text=Advanced+Integrations",
    instructor: "Mike Rodriguez",
    rating: 4.9,
    students: 856,
  },
  {
    id: 3,
    title: "AI-Powered Workflow Optimization",
    description: "Use AI to optimize and enhance your automation workflows",
    duration: "3 hours",
    lessons: 15,
    difficulty: "Intermediate",
    progress: 0,
    thumbnail: "/placeholder.svg?height=200&width=300&text=AI+Optimization",
    instructor: "Dr. Emily Watson",
    rating: 4.7,
    students: 642,
  },
]

const tutorials = [
  {
    title: "Setting up your first Slack integration",
    type: "Video",
    duration: "8 min",
    views: "12.5k",
    thumbnail: "/placeholder.svg?height=120&width=200&text=Slack+Tutorial",
  },
  {
    title: "Creating conditional logic in workflows",
    type: "Article",
    duration: "5 min read",
    views: "8.2k",
    thumbnail: "/placeholder.svg?height=120&width=200&text=Conditional+Logic",
  },
  {
    title: "Error handling best practices",
    type: "Video",
    duration: "12 min",
    views: "15.8k",
    thumbnail: "/placeholder.svg?height=120&width=200&text=Error+Handling",
  },
  {
    title: "Workflow performance optimization",
    type: "Article",
    duration: "7 min read",
    views: "6.9k",
    thumbnail: "/placeholder.svg?height=120&width=200&text=Performance+Tips",
  },
]

const achievements = [
  { name: "First Workflow", description: "Created your first workflow", earned: true },
  { name: "Integration Master", description: "Connected 5 different services", earned: true },
  { name: "Automation Expert", description: "Completed 100 workflow runs", earned: false },
  { name: "Community Helper", description: "Helped 10 community members", earned: false },
]

export default function LearnContent() {
  return (
    <AppLayout title="Learn" subtitle="Master workflow automation with our comprehensive courses and tutorials">
      <div className="space-y-8">
        {/* Browse All Courses Button */}
        <div className="flex justify-end">
          <Button>
            <BookOpen className="w-4 h-4 mr-2" />
            Browse All Courses
          </Button>
        </div>

        {/* Progress Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <BookOpen className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-600">Courses Enrolled</p>
                  <p className="text-2xl font-bold text-slate-900">3</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-600">Lessons Completed</p>
                  <p className="text-2xl font-bold text-slate-900">18</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <Clock className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-600">Hours Learned</p>
                  <p className="text-2xl font-bold text-slate-900">12.5</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                  <Award className="w-5 h-5 text-yellow-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-600">Achievements</p>
                  <p className="text-2xl font-bold text-slate-900">2/4</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* My Courses */}
        <div>
          <h2 className="text-2xl font-bold text-slate-900 mb-6">My Courses</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {courses.map((course) => (
              <Card key={course.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                <div className="aspect-video bg-slate-100 relative">
                  <img
                    src={course.thumbnail || "/placeholder.svg"}
                    alt={course.title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                    <Button size="sm" className="bg-white text-slate-900 hover:bg-slate-100">
                      <Play className="w-4 h-4 mr-2" />
                      Continue
                    </Button>
                  </div>
                </div>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-2">
                    <Badge
                      variant={
                        course.difficulty === "Beginner"
                          ? "default"
                          : course.difficulty === "Intermediate"
                            ? "secondary"
                            : "destructive"
                      }
                    >
                      {course.difficulty}
                    </Badge>
                    <div className="flex items-center space-x-1">
                      <Star className="w-4 h-4 text-yellow-400 fill-current" />
                      <span className="text-sm text-slate-600">{course.rating}</span>
                    </div>
                  </div>
                  <h3 className="font-semibold text-slate-900 mb-2">{course.title}</h3>
                  <p className="text-sm text-slate-600 mb-4">{course.description}</p>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm text-slate-600">
                      <span>{course.lessons} lessons</span>
                      <span>{course.duration}</span>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-600">Progress</span>
                        <span className="font-medium">{course.progress}%</span>
                      </div>
                      <Progress value={course.progress} className="h-2" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Quick Tutorials */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-slate-900">Quick Tutorials</h2>
            <Button variant="outline">
              View All
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {tutorials.map((tutorial, index) => (
              <Card key={index} className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer">
                <div className="aspect-video bg-slate-100 relative">
                  <img
                    src={tutorial.thumbnail || "/placeholder.svg"}
                    alt={tutorial.title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-2 left-2">
                    <Badge variant={tutorial.type === "Video" ? "default" : "secondary"}>
                      {tutorial.type === "Video" ? (
                        <Video className="w-3 h-3 mr-1" />
                      ) : (
                        <FileText className="w-3 h-3 mr-1" />
                      )}
                      {tutorial.type}
                    </Badge>
                  </div>
                </div>
                <CardContent className="p-4">
                  <h3 className="font-medium text-slate-900 mb-2 line-clamp-2">{tutorial.title}</h3>
                  <div className="flex items-center justify-between text-sm text-slate-600">
                    <span>{tutorial.duration}</span>
                    <span>{tutorial.views} views</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Achievements */}
        <div>
          <h2 className="text-2xl font-bold text-slate-900 mb-6">Achievements</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {achievements.map((achievement, index) => (
              <Card
                key={index}
                className={`p-4 ${achievement.earned ? "bg-green-50 border-green-200" : "bg-slate-50"}`}
              >
                <div className="flex items-center space-x-3">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      achievement.earned ? "bg-green-100" : "bg-slate-200"
                    }`}
                  >
                    <Award className={`w-5 h-5 ${achievement.earned ? "text-green-600" : "text-slate-400"}`} />
                  </div>
                  <div>
                    <h3 className={`font-medium ${achievement.earned ? "text-green-900" : "text-slate-600"}`}>
                      {achievement.name}
                    </h3>
                    <p className={`text-sm ${achievement.earned ? "text-green-700" : "text-slate-500"}`}>
                      {achievement.description}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
