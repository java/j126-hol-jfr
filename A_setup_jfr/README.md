# Configuring JFR to Capture Data and Performing Analysis 

JFR is an event-based diagnostic and profiling framework that can be used to capture information about the JVM, JDK, and your applications. It can be used for both debugging purposes as well as comparative analysis to measure the impact of optimizations. To demonstrate this, we’ll use Ahead-of-Time (AOT) computation, a performance feature being developed under [Project Leyden](https://openjdk.org/projects/leyden).

JDK 24 introduced the Ahead-Of-Time (AOT) cache via [JEP 483: Ahead-of-Time Class Loading & Linking](https://openjdk.org/jeps/483). This is a HotSpot JVM feature that caches classes after they are read, parsed, loaded, and linked. Creating an AOT cache is specific to an application, and you can reuse it in subsequent runs of that application to improve the time to the first functional unit of work (start up time) and time to peak performance (warm up time).

A training run captures application configuration and execution history for use in subsequent test and production runs. Let's explore how to use JFR to measure performance optimizations while getting familiar with AOT caching!

## **Lab Activity 1**: Configure and Run JFR to Record Specific Events

JFR uses profiles configured in `.jfc` files to control the types and conditions under which JFR events are captured and information collected. These are standard XML files, with a specific schema that JFR understands. There are 2 JFR profiles shipped with the JDK:

* `default.jfc` that has less than 1% overhead and is designed for continuous recording ("always on")
* `profile.jfc` can have slightly more overhead (<2%) due to increasing the amount of information it is capturing.

1. Check where those two profiles are located by running the following commands in a terminal window:

```shell
# windows compatible command
dir "%JAVA_HOME%\lib\jfr"

# macOS and Linux compatible command
ls "$JAVA_HOME/lib/jfr"
```

2. Open `default.jfc` in a text editor and search for `jdk.ClassLoad` event.
3. Check if the event is enabled or not. If not enabled, you can run the following command in the terminal window:

```shell
# Configure the event and write a settings file.
#
# Note: the output file is written relative to your current working directory.
$ jfr configure 'jdk.ClassLoad#enabled=true' --output custom.jfc
```

Running a command like the one above should create a new file named `custom.jfc` in your current working directory.
This new file contains a configuration based on `default.jfc`, but with the `jdk.ClassLoad` event enabled. Open the file and double check that the event is enabled.

> [!TIP] 
> JFR also has a 12-step interactive wizard, which can walk you through creating a new .jfc. This can provide more detail on the various options for configuring JFR and the impacts those options might have on performance. Accepting all the defaults creates a .jfc file that is equivalent to default.jfc. Give it a shot by running `$ jfr configure --interactive` in the terminal window.

4. To capture which classes are loaded, you should start a JFR recording when you launch your application by running the following command in the terminal while in the `spring-petclinic` directory:

```shell
$ java -XX:StartFlightRecording=settings=../custom.jfc,dumponexit=true,filename=recording-no-cache.jfr -jar target/spring-petclinic-4.0.0-SNAPSHOT.jar
```

5. Note the value you see for start up time (line containing `Started PetClinicApplication in`) of the application here.
6. Stop the application.
7. After shutting down the application, use the command:

```shell
$ jfr summary recording-no-cache.jfr
``` 

The top line in the report should be `jdk.ClassLoad`; the first number is the number of times that event fired during the runtime of the application. Make a note of this number.

> [!TIP] 
> The `jfr` tool does a good job of providing help for how to use an option. If you are unsure on how to use an option add `--help` to the end of it like this: `$ jfr print --help` to see what's available and provide usage instructions.

## **Lab Activity 2**: Create an AOT cache and Compare Recordings

The next step after observing which classes are loaded at runtime is to see how the AOT cache takes class loads into account. Let's walk through the process of creating and using an AOT cache.

1. With JDK 25, [JEP 514](https://openjdk.org/jeps/514) introduced the 1-step workflow for creating an AOT cache with the `-XX:AOTCacheOutput` JVM argument. Let's use it to execute our training run and build our cache by running this command from your terminal:

```shell
$ java -XX:AOTCacheOutput=app.aot -XX:StartFlightRecording=settings=../custom.jfc -jar target/spring-petclinic-4.0.0-SNAPSHOT.jar 
```
> [!TIP] 
> It's important to have your training runs match production as closely as possible. While we aren't going to review the JFR recording from our training run, we do want JFR enabled, so the classes and behavior of JFR will be included in the generated AOT cache.


2. Stop the application once it has finished starting up. Note the AOT cache creation process on JVM shutdown.


> [!TIP] 
> The one-step process for creating an AOT cache has increased memory needs. A second JVM, with identical settings, is created to build the cache once the shutdown process for the first JVM is started. You can see this in the output with the logging statement `Launching child process`. If this might be an issue in your production environment, you can follow the two-step cache creation process here: [https://openjdk.org/jeps/514#Motivation](https://openjdk.org/jeps/514#Motivation)


3. With the AOT cache created, let's use it to improve the start up performance for our application by telling it to use the cache with `-XX:AOTCache=[cache-name]`:

```shell
$ java -XX:AOTCache=app.aot -XX:StartFlightRecording=settings=../custom.jfc,dumponexit=true,filename=recording-with-cache.jfr -jar target/spring-petclinic-4.0.0-SNAPSHOT.jar
```

4. Note the start up time `Started PetClinicApplication in` and compare it to the initial run. It should be reduced by 20-30%. 

5. Stop the application.

6. After shutting down the application, use `jfr summary` again: 

```shell
jfr summary recording-with-cache.jfr
```
And compare the count of `jdk.ClassLoad` events to the number from the first run. It should be about 30% fewer!  


## **Extra Credit Lab Activity**: Build an AOT cache on an extracted jar

You can run your application using the executable jar, but loading the classes from nested jars has an additional start up cost. 

Depending on the size of the jar, running the application from an exploded structure is faster and recommended in production.

The extract step is needed because Spring Boot uses a custom class loader to support jars in jars. Custom classloaders do not get the same AOT cache treatment as the built-in classloaders, but this may be something that changes in the future.

```shell
# exec in a terminal window opened with `spring-petclinic` as working directory 
$ java -Djarmode=tools -jar target/spring-petclinic-4.0.0-SNAPSHOT.jar extract --destination extracted
```
The tree of the working directory (`spring-petclinic`) should look like the one below:



```shell
├── LICENSE.txt
├── README.md
├── app.aot
├── build.gradle
├── custom.jfc
├── docker-compose.yml
├── extracted
│   ├── application
│   │   └── spring-petclinic-4.0.0-SNAPSHOT.jar
│   ├── dependencies
│   │   └── lib
│   ├── snapshot-dependencies
│   └── spring-boot-loader
├── gradle
├── gradlew
├── gradlew.bat
├── k8s
├── mvnw
├── mvnw.cmd
├── pom.xml
├── recording.jfr
├── settings.gradle
├── src
└── target
```

Now run through the process of creating and using an AOT cache we covered in the previous two labs, and compare the performance of using a cache against an extracted jar versus an "uber" jar. 

