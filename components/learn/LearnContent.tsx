"use client"

import { useState, useEffect } from "react"
import AppLayout from "@/components/layout/AppLayout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { BookOpen, Video, FileText, Award, Clock, Star, Play, CheckCircle, ArrowRight, Plus, Search, Filter, Users, MessageSquare, Heart, Share2, Bookmark, Zap, Bot, Settings, HelpCircle, AlertTriangle, Bug, CreditCard, Calendar, TrendingUp, Target, Trophy, Lightbulb, Code, Database, Globe, Shield } from "lucide-react"
import { toast } from "sonner"
import { useAuthStore } from "@/stores/authStore"

interface Course {
  id: string
  title: string
  description: string
  duration: string
  lessons: number
  difficulty: "Beginner" | "Intermediate" | "Advanced"
  progress: number
  thumbnail: string
  instructor: string
  rating: number
  students: number
  category: string
  tags: string[]
  lessons_list: Lesson[]
  is_enrolled: boolean
  created_at: string
}

interface Lesson {
  id: string
  title: string
  type: "video" | "article" | "quiz" | "exercise"
  duration: string
  is_completed: boolean
  content?: string
  video_url?: string
  quiz_questions?: QuizQuestion[]
}

interface QuizQuestion {
  id: string
  question: string
  options: string[]
  correct_answer: number
  explanation: string
}

interface Tutorial {
  id: string
  title: string
  type: "Video" | "Article"
  duration: string
  views: string
  thumbnail: string
  category: string
  tags: string[]
  is_bookmarked: boolean
  created_at: string
}

interface Achievement {
  id: string
  name: string
  description: string
  icon: any
  earned: boolean
  progress?: number
  max_progress?: number
  category: string
  points: number
}

const defaultCourses: Course[] = [
  {
    id: "1",
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
    category: "Fundamentals",
    tags: ["workflows", "automation", "basics"],
    is_enrolled: true,
    created_at: "2024-01-01T00:00:00Z",
    lessons_list: [
      {
        id: "1-1",
        title: "Introduction to Workflow Automation",
        type: "video",
        duration: "10 min",
        is_completed: true,
        video_url: "https://example.com/video1"
      },
      {
        id: "1-2",
        title: "Understanding Triggers and Actions",
        type: "video",
        duration: "15 min",
        is_completed: true,
        video_url: "https://example.com/video2"
      },
      {
        id: "1-3",
        title: "Quiz: Basic Concepts",
        type: "quiz",
        duration: "5 min",
        is_completed: false,
        quiz_questions: [
          {
            id: "q1",
            question: "What is a trigger in workflow automation?",
            options: [
              "An action that starts a workflow",
              "An event that starts a workflow",
              "A condition that stops a workflow",
              "A result of a workflow"
            ],
            correct_answer: 1,
            explanation: "A trigger is an event that starts a workflow when it occurs."
          }
        ]
      }
    ]
  },
  {
    id: "2",
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
    category: "Advanced",
    tags: ["integrations", "data", "patterns"],
    is_enrolled: true,
    created_at: "2024-01-01T00:00:00Z",
    lessons_list: []
  },
  {
    id: "3",
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
    category: "AI & ML",
    tags: ["ai", "optimization", "machine-learning"],
    is_enrolled: false,
    created_at: "2024-01-01T00:00:00Z",
    lessons_list: []
  },
]

const defaultTutorials: Tutorial[] = [
  {
    id: "1",
    title: "Setting up your first Slack integration",
    type: "Video",
    duration: "8 min",
    views: "12.5k",
    thumbnail: "/placeholder.svg?height=120&width=200&text=Slack+Tutorial",
    category: "Integrations",
    tags: ["slack", "integration", "setup"],
    is_bookmarked: false,
    created_at: "2024-01-01T00:00:00Z"
  },
  {
    id: "2",
    title: "Creating conditional logic in workflows",
    type: "Article",
    duration: "5 min read",
    views: "8.2k",
    thumbnail: "/placeholder.svg?height=120&width=200&text=Conditional+Logic",
    category: "Workflows",
    tags: ["conditional", "logic", "workflows"],
    is_bookmarked: true,
    created_at: "2024-01-01T00:00:00Z"
  },
  {
    id: "3",
    title: "Error handling best practices",
    type: "Video",
    duration: "12 min",
    views: "15.8k",
    thumbnail: "/placeholder.svg?height=120&width=200&text=Error+Handling",
    category: "Best Practices",
    tags: ["error-handling", "best-practices"],
    is_bookmarked: false,
    created_at: "2024-01-01T00:00:00Z"
  },
  {
    id: "4",
    title: "Workflow performance optimization",
    type: "Article",
    duration: "7 min read",
    views: "6.9k",
    thumbnail: "/placeholder.svg?height=120&width=200&text=Performance+Tips",
    category: "Performance",
    tags: ["performance", "optimization"],
    is_bookmarked: false,
    created_at: "2024-01-01T00:00:00Z"
  },
]

const defaultAchievements: Achievement[] = [
  { 
    id: "1",
    name: "First Workflow", 
    description: "Created your first workflow", 
    icon: Zap,
    earned: true,
    category: "Creation",
    points: 10
  },
  { 
    id: "2",
    name: "Integration Master", 
    description: "Connected 5 different services", 
    icon: Database,
    earned: true,
    progress: 5,
    max_progress: 5,
    category: "Integration",
    points: 25
  },
  { 
    id: "3",
    name: "Automation Expert", 
    description: "Completed 100 workflow runs", 
    icon: Target,
    earned: false,
    progress: 67,
    max_progress: 100,
    category: "Execution",
    points: 50
  },
  { 
    id: "4",
    name: "Community Helper", 
    description: "Helped 10 community members", 
    icon: Users,
    earned: false,
    progress: 3,
    max_progress: 10,
    category: "Community",
    points: 30
  },
  { 
    id: "5",
    name: "Course Completer", 
    description: "Completed your first course", 
    icon: Trophy,
    earned: false,
    category: "Learning",
    points: 20
  },
  { 
    id: "6",
    name: "Problem Solver", 
    description: "Resolved 5 workflow errors", 
    icon: Bug,
    earned: false,
    progress: 2,
    max_progress: 5,
    category: "Troubleshooting",
    points: 15
  },
]

const categories = ["All", "Fundamentals", "Advanced", "AI & ML", "Integrations", "Best Practices", "Performance"]
const difficulties = ["All", "Beginner", "Intermediate", "Advanced"]

export default function LearnContent() {
  const { profile } = useAuthStore()
  const [courses, setCourses] = useState<Course[]>(defaultCourses)
  const [tutorials, setTutorials] = useState<Tutorial[]>(defaultTutorials)
  const [achievements, setAchievements] = useState<Achievement[]>(defaultAchievements)
  const [selectedCategory, setSelectedCategory] = useState("All")
  const [selectedDifficulty, setSelectedDifficulty] = useState("All")
  const [searchQuery, setSearchQuery] = useState("")
  const [activeTab, setActiveTab] = useState("courses")
  const [showCourseModal, setShowCourseModal] = useState(false)
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null)
  const [currentLesson, setCurrentLesson] = useState<Lesson | null>(null)
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({})
  const [showQuizResults, setShowQuizResults] = useState(false)

  const enrolledCourses = courses.filter(course => course.is_enrolled)
  const availableCourses = courses.filter(course => !course.is_enrolled)

  const filteredCourses = courses.filter((course) => {
    const matchesCategory = selectedCategory === "All" || course.category === selectedCategory
    const matchesDifficulty = selectedDifficulty === "All" || course.difficulty === selectedDifficulty
    const matchesSearch =
      course.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      course.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      course.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))

    return matchesCategory && matchesDifficulty && matchesSearch
  })

  const filteredTutorials = tutorials.filter((tutorial) => {
    const matchesCategory = selectedCategory === "All" || tutorial.category === selectedCategory
    const matchesSearch =
      tutorial.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tutorial.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))

    return matchesCategory && matchesSearch
  })

  const totalProgress = enrolledCourses.reduce((sum, course) => sum + course.progress, 0) / enrolledCourses.length || 0
  const totalLessonsCompleted = enrolledCourses.reduce((sum, course) => {
    return sum + course.lessons_list.filter(lesson => lesson.is_completed).length
  }, 0)
  const totalHoursLearned = enrolledCourses.reduce((sum, course) => {
    const hours = parseFloat(course.duration.split(" ")[0])
    return sum + (hours * course.progress / 100)
  }, 0)
  const earnedAchievements = achievements.filter(achievement => achievement.earned).length

  const handleEnrollCourse = (courseId: string) => {
    setCourses(courses.map(course => 
      course.id === courseId 
        ? { ...course, is_enrolled: true, progress: 0 }
        : course
    ))
    toast.success("Successfully enrolled in course!")
  }

  const handleStartLesson = (course: Course, lesson: Lesson) => {
    setSelectedCourse(course)
    setCurrentLesson(lesson)
    setShowCourseModal(true)
  }

  const handleCompleteLesson = (courseId: string, lessonId: string) => {
    setCourses(courses.map(course => {
      if (course.id === courseId) {
        const updatedLessons = course.lessons_list.map(lesson =>
          lesson.id === lessonId ? { ...lesson, is_completed: true } : lesson
        )
        const completedLessons = updatedLessons.filter(lesson => lesson.is_completed).length
        const progress = Math.round((completedLessons / course.lessons) * 100)
        return { ...course, lessons_list: updatedLessons, progress }
      }
      return course
    }))
    toast.success("Lesson completed!")
  }

  const handleQuizSubmit = () => {
    if (!currentLesson?.quiz_questions) return

    let correctAnswers = 0
    currentLesson.quiz_questions.forEach((question, index) => {
      if (quizAnswers[question.id] === question.correct_answer) {
        correctAnswers++
      }
    })

    const score = Math.round((correctAnswers / currentLesson.quiz_questions.length) * 100)
    
    if (score >= 80) {
      handleCompleteLesson(selectedCourse!.id, currentLesson.id)
      toast.success(`Quiz completed! Score: ${score}%`)
    } else {
      toast.error(`Quiz failed. Score: ${score}%. You need 80% to pass.`)
    }
    
    setShowQuizResults(true)
  }

  const handleBookmarkTutorial = (tutorialId: string) => {
    setTutorials(tutorials.map(tutorial =>
      tutorial.id === tutorialId 
        ? { ...tutorial, is_bookmarked: !tutorial.is_bookmarked }
        : tutorial
    ))
    toast.success("Tutorial bookmarked!")
  }

  const renderCourseCard = (course: Course) => (
    <Card key={course.id} className="overflow-hidden hover:shadow-lg transition-shadow">
      <div className="aspect-video bg-slate-100 relative">
        <img
          src={course.thumbnail || "/placeholder.svg"}
          alt={course.title}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
          {course.is_enrolled ? (
            <Button size="sm" className="bg-white text-slate-900 hover:bg-slate-100">
              <Play className="w-4 h-4 mr-2" />
              Continue
            </Button>
          ) : (
            <Button 
              size="sm" 
              className="bg-white text-slate-900 hover:bg-slate-100"
              onClick={() => handleEnrollCourse(course.id)}
            >
              <Plus className="w-4 h-4 mr-2" />
              Enroll
            </Button>
          )}
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

          {course.is_enrolled && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Progress</span>
                <span className="font-medium">{course.progress}%</span>
              </div>
              <Progress value={course.progress} className="h-2" />
            </div>
          )}

          <div className="flex items-center justify-between text-sm text-slate-600">
            <span>Instructor: {course.instructor}</span>
            <span>{course.students.toLocaleString()} students</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )

  const renderTutorialCard = (tutorial: Tutorial) => (
    <Card key={tutorial.id} className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer">
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
        <div className="absolute top-2 right-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 bg-white/80 hover:bg-white"
            onClick={(e) => {
              e.stopPropagation()
              handleBookmarkTutorial(tutorial.id)
            }}
          >
            <Bookmark className={`w-4 h-4 ${tutorial.is_bookmarked ? 'fill-current text-blue-600' : ''}`} />
          </Button>
        </div>
      </div>
      <CardContent className="p-4">
        <h3 className="font-medium text-slate-900 mb-2 line-clamp-2">{tutorial.title}</h3>
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>{tutorial.duration}</span>
          <span>{tutorial.views} views</span>
        </div>
        <div className="flex flex-wrap gap-1 mt-2">
          {tutorial.tags.slice(0, 2).map((tag, index) => (
            <Badge key={index} variant="secondary" className="text-xs">
              #{tag}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  )

  return (
    <AppLayout title="Learn" subtitle="Master workflow automation with our comprehensive courses and tutorials">
      <div className="space-y-8">
        {/* Search and Filters */}
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
            <Input
              placeholder="Search courses and tutorials..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex gap-2">
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedDifficulty} onValueChange={setSelectedDifficulty}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {difficulties.map((difficulty) => (
                  <SelectItem key={difficulty} value={difficulty}>
                    {difficulty}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
                  <p className="text-2xl font-bold text-slate-900">{enrolledCourses.length}</p>
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
                  <p className="text-2xl font-bold text-slate-900">{totalLessonsCompleted}</p>
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
                  <p className="text-2xl font-bold text-slate-900">{totalHoursLearned.toFixed(1)}</p>
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
                  <p className="text-2xl font-bold text-slate-900">{earnedAchievements}/{achievements.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="courses">My Courses ({enrolledCourses.length})</TabsTrigger>
            <TabsTrigger value="available">Available Courses ({availableCourses.length})</TabsTrigger>
            <TabsTrigger value="tutorials">Tutorials ({filteredTutorials.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="courses" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-slate-900">My Courses</h2>
              <Button>
                <BookOpen className="w-4 h-4 mr-2" />
                Browse All Courses
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {enrolledCourses.map(renderCourseCard)}
            </div>
            {enrolledCourses.length === 0 && (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <BookOpen className="w-16 h-16 text-slate-300 mb-4" />
                  <h3 className="text-xl font-semibold text-slate-600 mb-2">No enrolled courses</h3>
                  <p className="text-slate-500 text-center mb-4">
                    Start your learning journey by enrolling in a course
                  </p>
                  <Button onClick={() => setActiveTab("available")}>
                    Browse Courses
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="available" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-slate-900">Available Courses</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {availableCourses.map(renderCourseCard)}
            </div>
          </TabsContent>

          <TabsContent value="tutorials" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-slate-900">Quick Tutorials</h2>
              <Button variant="outline">
                View All
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {filteredTutorials.map(renderTutorialCard)}
            </div>
          </TabsContent>
        </Tabs>

        {/* Achievements */}
        <div>
          <h2 className="text-2xl font-bold text-slate-900 mb-6">Achievements</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {achievements.map((achievement) => {
              const IconComponent = achievement.icon
              return (
                <Card
                  key={achievement.id}
                  className={`p-4 ${achievement.earned ? "bg-green-50 border-green-200" : "bg-slate-50"}`}
                >
                  <div className="flex items-center space-x-3">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        achievement.earned ? "bg-green-100" : "bg-slate-200"
                      }`}
                    >
                      <IconComponent className={`w-5 h-5 ${achievement.earned ? "text-green-600" : "text-slate-400"}`} />
                    </div>
                    <div className="flex-1">
                      <h3 className={`font-medium ${achievement.earned ? "text-green-900" : "text-slate-600"}`}>
                        {achievement.name}
                      </h3>
                      <p className={`text-sm ${achievement.earned ? "text-green-700" : "text-slate-500"}`}>
                        {achievement.description}
                      </p>
                      {achievement.progress !== undefined && (
                        <div className="mt-2">
                          <div className="flex justify-between text-xs text-slate-500 mb-1">
                            <span>Progress</span>
                            <span>{achievement.progress}/{achievement.max_progress}</span>
                          </div>
                          <Progress value={(achievement.progress / achievement.max_progress!) * 100} className="h-1" />
                        </div>
                      )}
                      <div className="flex items-center justify-between mt-2">
                        <Badge variant="secondary" className="text-xs">
                          {achievement.category}
                        </Badge>
                        <span className="text-xs text-slate-500">{achievement.points} pts</span>
                      </div>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        </div>
      </div>

      {/* Course Lesson Modal */}
      <Dialog open={showCourseModal} onOpenChange={setShowCourseModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {selectedCourse && currentLesson && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                    <BookOpen className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <div className="text-sm text-slate-500">{selectedCourse.title}</div>
                    <div>{currentLesson.title}</div>
                  </div>
                </DialogTitle>
                <DialogDescription>
                  {currentLesson.type === "video" && "Watch the video to learn"}
                  {currentLesson.type === "article" && "Read the article to learn"}
                  {currentLesson.type === "quiz" && "Test your knowledge"}
                  {currentLesson.type === "exercise" && "Complete the exercise"}
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-6">
                {currentLesson.type === "video" && (
                  <div className="aspect-video bg-slate-100 rounded-lg flex items-center justify-center">
                    <div className="text-center">
                      <Video className="w-16 h-16 text-slate-400 mx-auto mb-4" />
                      <p className="text-slate-600">Video content would be embedded here</p>
                      <p className="text-sm text-slate-500 mt-2">Duration: {currentLesson.duration}</p>
                    </div>
                  </div>
                )}

                {currentLesson.type === "article" && (
                  <div className="prose max-w-none">
                    <p className="text-slate-700 leading-relaxed">
                      {currentLesson.content || "Article content would be displayed here..."}
                    </p>
                  </div>
                )}

                {currentLesson.type === "quiz" && currentLesson.quiz_questions && (
                  <div className="space-y-6">
                    {currentLesson.quiz_questions.map((question, index) => (
                      <div key={question.id} className="space-y-3">
                        <h4 className="font-medium text-slate-900">
                          Question {index + 1}: {question.question}
                        </h4>
                        <div className="space-y-2">
                          {question.options.map((option, optionIndex) => (
                            <label key={optionIndex} className="flex items-center space-x-3 cursor-pointer">
                              <input
                                type="radio"
                                name={question.id}
                                value={optionIndex}
                                checked={quizAnswers[question.id] === optionIndex}
                                onChange={(e) => setQuizAnswers({
                                  ...quizAnswers,
                                  [question.id]: parseInt(e.target.value)
                                })}
                                className="text-blue-600"
                              />
                              <span className="text-slate-700">{option}</span>
                            </label>
                          ))}
                        </div>
                        {showQuizResults && (
                          <div className={`p-3 rounded-lg ${
                            quizAnswers[question.id] === question.correct_answer 
                              ? "bg-green-50 border border-green-200" 
                              : "bg-red-50 border border-red-200"
                          }`}>
                            <p className={`text-sm ${
                              quizAnswers[question.id] === question.correct_answer 
                                ? "text-green-800" 
                                : "text-red-800"
                            }`}>
                              {quizAnswers[question.id] === question.correct_answer 
                                ? "✓ Correct!" 
                                : "✗ Incorrect. " + question.explanation}
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {currentLesson.type === "exercise" && (
                  <div className="space-y-4">
                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <h4 className="font-medium text-blue-900 mb-2">Exercise Instructions</h4>
                      <p className="text-blue-800">
                        Complete the practical exercise to reinforce your learning. 
                        Follow the step-by-step instructions provided.
                      </p>
                    </div>
                    <div className="p-4 border border-slate-200 rounded-lg">
                      <p className="text-slate-700">
                        Exercise content and interactive elements would be displayed here...
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end space-x-2 pt-6 border-t">
                <Button variant="outline" onClick={() => setShowCourseModal(false)}>
                  Close
                </Button>
                {currentLesson.type === "quiz" ? (
                  <Button onClick={handleQuizSubmit}>
                    Submit Quiz
                  </Button>
                ) : (
                  <Button onClick={() => handleCompleteLesson(selectedCourse.id, currentLesson.id)}>
                    Mark as Complete
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  )
}
