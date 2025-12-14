/*============================================================================================================
 @Include: */ include("ssi.utils.js"); /*
 @Script: ssi.generate.surveys.js
 @Author: Danny Carvajal (Updated by Nathan Hensher)
 @Version: 1.1.0 
 @Date: 31/03/2025
 @Notes: This script will iterate through existing surveys in acu_survey table and create X number of
 acu_survey_feedback records. It can also create the scopes for all available groups if you have createScopes 
 set to true. It reads all Acumen groups and assigns them the existing surveys.
 
 Updates:
 - Added multiple groups for each user (Department, Location, Team, Position)
 - Added workLocation value to each response
=============================================================================================================*/

const cfg = {
    createFeedback  : true,
    createScopes    : false,
    surveyName      : null, // optional
    surveyIds       : [1] // optional
}

const feedback = {
    min : 50,
    max : 50
}

const score = {
    min : 1,
    max : 5
}

const rpt = {
    err        : "n/a",
    created    : 0,
    exists     : 0,
    scopes     : 0
}

// Answered On date range
const startDate = new java.util.Date("3/1/2025")
const endDate = new java.util.Date("3/1/2025")

// Group types to include for each user
const GROUP_TYPES = ["DEPARTMENT", "LOCATION", "TEAM", "POSITION"]

// Sample group names for each type
const GROUP_NAMES = {
    "DEPARTMENT": ["Engineering", "Sales", "Marketing", "HR", "Finance", "Operations"],
    "LOCATION": ["Leamington Spa", "London", "Manchester", "Birmingham", "Edinburgh", "Glasgow"],
    "TEAM": ["Frontend", "Backend", "DevOps", "QA", "UX", "Product"],
    "POSITION": ["Developer", "Manager", "Director", "VP", "Analyst", "Designer"]
}

// Sample work locations
const WORK_LOCATIONS = [
    { id: 1, name: "Office" },
    { id: 2, name: "Home" },
    { id: 3, name: "Hybrid" },
    { id: 4, name: "Remote" }
]

let run = function() {

    let q = Query.select(java.util.Arrays.asList(Query.column("s.id", "id")))
    q.from("acu_survey", "s")
    if (cfg.surveyName) q.where(Criterion.EQ("name", cfg.surveyName));
    if (cfg.surveyIds) q.where(Criterion.IN("id", cfg.surveyIds));  
    let surveys = this.exec.executeL1(q)   
    let totalSurveys = surveys.length
    if (totalSurveys == 0) throw "There are no surveys!"

    for (let i = 0; i < totalSurveys; i++) {

        let currentSurvey = surveys[i]
        let recCount = this.rand(feedback.min, feedback.max, 0)      
        
        let q = Query.select(java.util.Arrays.asList(Query.column("u.id", "user")))
        q.from("cmn_user", "u")
        q.join("cmn_person", "p", "p.id", "u.person")
        q.limit(recCount)
        let users = this.exec.executeL1(q)         

        // Loop through users with a Person
        for (let u = 0; u < users.length; u++) {

            if (jobHandle.isStopped()) throw "Cancelled..." 

            let user = users[u]

            let crits = new java.util.ArrayList()
            crits.add(EQ("user", user))
            crits.add(EQ("survey", currentSurvey))

            // Make sure feedback doesn't already exist to avoid duplicates
            //let feedbackCount = this.mgr.query("acu_survey_feedback").where(AND(crits)).count()
            ///if (feedbackCount == 0) {

                // Create the feedback record
                let feedback = this.mgr.create("acu_survey_feedback")
                feedback.set("survey", currentSurvey)
                feedback.set("user", user)
                feedback.set("score", rand(score.min, score.max, 0))
                feedback.set("answered_on", getAnsweredOn(startDate, endDate))
                
                // Generate groups for this user
                let userGroups = generateUserGroups(user)
                
                // Store the groups as JSON in a custom field
                // Note: You may need to adjust this based on your database schema
                feedback.set("groups_json", JSON.stringify(userGroups))
                
                // Generate and store work location
                let workLocation = generateWorkLocation()
                feedback.set("work_location_json", JSON.stringify(workLocation))
                
                if (cfg.createFeedback) feedback.save()
                rpt.created++

            //} else {
            //    rpt.exists++
            //}

            let percentage = ((i / totalSurveys) * 100.0)
            jobState.onProgress(percentage, String.format("Processing user {0} for Survey {1}/{2}...",
                user, i, totalSurveys
            ))             
        }    
        
        /* -------------------------------------------------------------------------------
           If desired, create scope records using all available groups
           -----------------------------------------------------------------------------*/
        if (cfg.createScopes) {

            let q = Query.select(java.util.Arrays.asList(Query.column("g.id", "user")))
            q.from("acu_group", "g")
            let groups = this.exec.executeL1(q)
    
            for (let y = 0; y < groups.length; y++) {

                if (jobHandle.isStopped()) throw "Cancelled..." 
                let group = groups[y]

                let crits = new java.util.ArrayList()
                crits.add(EQ("group", group))
                crits.add(EQ("survey", currentSurvey))

                // Make sure scope doesn't already exist to avoid duplicates
                let scopeCount = this.mgr.query("acu_survey_scope").where(AND(crits)).count()
                if (scopeCount == 0) {
                    let scope = this.mgr.create("acu_survey_scope")
                    scope.set("group", group)
                    scope.set("survey", currentSurvey)
                    scope.save()
                    rpt.scopes++
                }
            }
        }
    }
}

/* -------------------------------------------------------------------------------
    Generate random groups for a user
   -----------------------------------------------------------------------------*/
let generateUserGroups = function(userId) {
    let groups = []
    
    // Generate 1-4 groups for this user (one of each type)
    for (let i = 0; i < GROUP_TYPES.length; i++) {
        let groupType = GROUP_TYPES[i]
        let possibleNames = GROUP_NAMES[groupType]
        let groupName = possibleNames[rand(0, possibleNames.length - 1, 0)]
        
        // Generate a random groupId (in a real scenario, this would be a reference to an actual group)
        let groupId = rand(1, 100, 0)
        
        groups.push({
            groupId: groupId,
            groupName: groupName,
            groupType: groupType
        })
    }
    
    return groups
}

/* -------------------------------------------------------------------------------
    Generate random work location
   -----------------------------------------------------------------------------*/
let generateWorkLocation = function() {
    return WORK_LOCATIONS[rand(0, WORK_LOCATIONS.length - 1, 0)]
}

/* -------------------------------------------------------------------------------
    Generate random dates for the answered_on field
   -----------------------------------------------------------------------------*/
let getAnsweredOn = function(startDate, endDate) {
    
    let days = this.getDateDiff(startDate, endDate) 
    let rand = this.rand(0, days, 0)
    let newDate = new java.util.Date(startDate)
    newDate.setDate(newDate.getDate() + rand)    
    
    return buildDate(newDate, 
        this.rand(0,18,0), 
            this.rand(0,59,0), 
                this.rand(0,59,0))
}


/* -------------------------------------------------------------------------------
    Set random hour, minutes and seconds and a date
   -----------------------------------------------------------------------------*/
let buildDate = function(curDate, hour, min, sec) {
      
    let Calendar = java.util.Calendar
    let cal = Calendar.getInstance()
    cal.setTime(curDate)
    cal.set(Calendar.HOUR_OF_DAY, hour)
    cal.set(Calendar.MINUTE, min)
    cal.set(Calendar.SECOND, sec)     
    return cal.getTime()      
}


/* ----------------------------------------------------------------------------------------------------------------

 STARTING POINT

---------------------------------------------------------------------------------------------------------------- */ 
try {
  
    run()    
  
} catch (e) {
  
    rpt.err = e
  
} finally {
  
    let result = String.format("Records created: {0}, Records exist: {1}, Scopes created: {2}, Create feedback = {3}, Create scopes = {4}, Last error: {5}.", 
        rpt.created,
        rpt.exists,
        rpt.scopes,
        cfg.createFeedback,
        cfg.createScopes,
        rpt.err)

    jobState.onProgress(100.0, result)			
}
