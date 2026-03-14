# Manage and Analyze JFR Recordings

JFR is incredibly flexible and offers many options for managing and analyzing JFR recordings! In [A_setup_jfr](../A_setup_jfr/README.md), we enabled JFR recordings through JVM arguments at application startup. It is also possible to start/stop/check a recording using `jcmd` with:

```
$ jcmd <pid> JFR.[start|stop|check|dump]
```

Once you have a JFR recording, the `jfr` tool provides several options for analyzing a recording: 

* Get high-level details with `jfr summary` to view recording duration, event counts, sizes, and configuration at a glance.
* Inspect events with `jfr print` to list or filter recorded events for deeper analysis.
* Analyze with `jfr view [view]` to query the JFR recording
* View all the options available with `jfr --help` and suboptions with `jfr <option> --help`

We will be exploring each of these tools in this module. 

##  **Lab Activity 1**: Use `jcmd` to Manage JFR

1. From the terminal, make sure you are in the `spring-petclinic` folder
2. Start the application without JFR enabled:

```shell
$ java -jar target/spring-petclinic-4.0.0-SNAPSHOT.jar
```

3. Open a separate terminal window.
4. Use `jps` to find the `pid` of the petclinic app you just started.

```shell
$ jps
```

You should get an output that looks like the below, copy the value to the left of: `spring-petclinic-4.0.0-SNAPSHOT.jar`

```
928 JMC
6294 XMLServerLauncher
920 Eclipse
8378 spring-petclinic-4.0.0-SNAPSHOT.jar
8475 Jps
```

5. Use `jcmd` to start a JFR recording on the petclinic app:

```shell
$ jcmd <pid> JFR.start filename=inflight-recording.jfr
```

6. Note when you run this command, part of the response you get includes how to dump a recording out of it:

```
Use jcmd <pid> JFR.dump name=1 to copy recording data to file.
```


7. Run the load test utility in the lab-jfr folder using the `VETS` option to generate activity for analysis:

```shell
$ java ../LoadTestUtility.java VETS
```

8. Dump the recording using `jcmd`:

```shell
$ jcmd <pid> JFR.dump name=1
```

## **Lab Activity 2**: Use the `jfr` Tool to Analyze Recordings

Using the recording we captured from the previous lab, we will explore some of the options for analyzing it with the `jfr` tool.

1. Using `jfr view` we can get an overview of garbage collection behavior, with the `gc` view like this:

```shell
$ jfr view gc inflight-recording.jfr
```

Reviewing the output we can see the size of the heap even after a garbage collection is steadily growing over time:

```
Start    GC ID Type                     Heap Before GC Heap After GC Longest Pause
-------- ----- ------------------------ -------------- ------------- -------------
20:34:27    20 Young Garbage Collection       235.4 MB       40.7 MB       4.65 ms
20:34:29    21 Young Garbage Collection       240.7 MB       41.4 MB       3.84 ms
20:34:30    22 Young Garbage Collection       241.4 MB       42.4 MB       3.42 ms
20:34:31    23 Young Garbage Collection       234.4 MB       43.9 MB       3.49 ms
20:34:32    24 Young Garbage Collection       235.9 MB       43.9 MB       3.82 ms
20:34:33    25 Young Garbage Collection       235.9 MB       45.8 MB       4.79 ms
20:34:34    26 Young Garbage Collection       237.8 MB       45.7 MB       4.87 ms
20:34:35    27 Young Garbage Collection       237.7 MB       46.5 MB       4.91 ms
20:34:36    28 Young Garbage Collection       238.5 MB       47.5 MB       5.54 ms
20:34:37    29 Young Garbage Collection       239.5 MB       48.9 MB       5.42 ms
20:34:38    30 Young Garbage Collection       248.9 MB       48.9 MB       5.94 ms
20:34:39    31 Young Garbage Collection       248.9 MB       50.0 MB       6.39 ms
20:34:40    32 Young Garbage Collection       242.0 MB       50.7 MB       6.78 ms
20:34:41    33 Young Garbage Collection       242.7 MB       51.8 MB       6.95 ms
```

In our example, because the load test is exercising only a single area of the application, we shouldn't be seeing such a consistent growth in `Heap After GC`.

3. To help with tracking the possible memory leak, there are a couple of other `jfr view` options, you can view all the available jfr views with `jfr view`:

```shell
$ jfr view
```

Which will print out all the available view options:

```
Java virtual machine views:
 blocked-by-system-gc      gc-concurrent-phases jvm-information        
 class-modifications       gc-configuration     longest-compilations   
 compiler-configuration    gc-cpu-time          native-memory-committed
 compiler-phases           gc-parallel-phases   native-memory-reserved 
 compiler-statistics       gc-pause-phases      safepoints             
 deoptimizations-by-reason gc-pauses            tlabs                  
 deoptimizations-by-site   gc-references        vm-operations          
 gc                        heap-configuration  

Environment views:
 active-recordings        cpu-load              native-library-failures
 active-settings          cpu-load-samples      network-utilization    
 container-configuration  cpu-tsc               recording              
 container-cpu-throttling environment-variables system-information     
 container-cpu-usage      events-by-count       system-processes       
 container-io-usage       events-by-name        system-properties      
 container-memory-usage   jvm-flags            

Application views:
 allocation-by-class            exception-by-site     method-timing        
 allocation-by-site             exception-by-type     modules              
 allocation-by-thread           exception-count       monitor-inflation    
 class-loaders                  file-reads-by-path    native-methods       
 contention-by-address          file-writes-by-path   object-statistics    
 contention-by-class            finalizers            pinned-threads       
 contention-by-site             hot-methods           socket-reads-by-host 
 contention-by-thread           latencies-by-type     socket-writes-by-host
 cpu-time-hot-methods           longest-class-loading thread-allocation    
 cpu-time-statistics            memory-leaks-by-class thread-count         
 deprecated-methods-for-removal memory-leaks-by-site  thread-cpu-load      
 exception-by-message           method-calls          thread-start         
```

> [!TIP] 
> The number of views grows with every release, and some of these views, like `finalizers` are very specialized for finding specific issues. It can be good to run `jfr views` when updating JDK versions.  


4. Under the `Application views` section we see a couple of options for finding memory leaks, `memory-leaks-by-class` and `memory-leaks-by-site`. Let's run `memory-leaks-by-class`:

```shell
$ jfr view memory-leaks-by-class inflight-recording.jfr
```

This should produce output that looks something like this:
 
```
                        Memory Leak Candidates by Class

Alloc. Time Object Class                                  Object Age Heap Usage
----------- --------------------------------------------- ---------- ----------
20:34:35    jdk.jfr.internal.event.EventWriter              9 m 51 s    45.7 MB
20:34:37    java.util.ArrayList                             9 m 49 s    48.9 MB
20:34:38    java.lang.Object[]                              9 m 48 s    48.9 MB
20:44:15    jdk.internal.event.ThreadSleepEvent               11.2 s    60.9 MB
```

This output *suggests* there's an `ArrayList` never being garbage collected. However there are certainly many `ArrayList` instances in the application, let's use `memory-leaks-by-site` to help narrow it down:

```shell
$ jfr view memory-leaks-by-site inflight-recording.jfr
``` 

And we get back...

```
                         Memory Leak Candidates by Site

Alloc. Time Application Method                            Object Age Heap Usage
----------- --------------------------------------------- ---------- ----------
20:44:15    N/A                                               11.2 s    60.9 MB
```

Hmmm, that's no good! When we enabled the JFR recording, we used the default settings. To maintain performance, the JFR default settings limit what data JFR collects. However, don't stop the **petclinic app!** We will find a way of changing this _while keeping petclinic up and running_ in the next lab!

## **Lab Activity 3**: Reconfigure a Recording to Track Down an Issue

When issues come up in production, especially long running issues like a memory leak, it's very important to be able to collect data from the still running application. You don't want to have to stop an application, reconfigure it, and have to wait minutes, hours, or days, for the issue to crop up again. With `jcmd` and `jfr` we can reconfigure settings on the fly without stopping the application, let's do that now. 

1. First we need to have a JFR settings file that will collect the information we need. The easiest way to do this is with the `jfr` configuration wizard, run the command below, but don't advance through any of the steps!

```shell
$ jfr configure --interactive --output memory-leak-detection.jfc
```

2. The jfr configuration wizard is a 12-step process, to create a new settings file. The first six steps, we can just accept the defaults (hit Enter), however the seventh step is the important one, when you see the below step, be sure to select `4`:

```
Memory Leak Detection: Object Types (default)
1. Off
2. Object Types
3. Object Types + Allocation Stack Traces
4. Object Types + Allocation Stack Traces + Path to GC Root
```

3. Go ahead and select the defaults (Enter) for the remaining steps. 

4. Let’s start a new recording on the petclinic app using our new memory-leak settings:

```shell
$ jcmd <pid> JFR.start filename=memory-leak-recording.jfr settings=memory-leak-detection.jfc
```

You will get a response back:

```
Use jcmd <pid> JFR.dump name=2 to copy recording data to file.
```

Note recording name (`2`). We actually started a _second recording_, and to get the additional data to track down the memory leak, we will want dump _the second recording._

> [!TIP] 
> Starting a second recording isn’t as heavyweight as it sounds. The only additional work JFR would be doing would be capturing the events related to a memory-leak. Running two recordings doesn’t necessarily double JFR overhead; the incremental cost is primarily in the additional events being captured. 


5. Re-run the load test:

```shell
$ java ../LoadTestUtility.java VETS
```

6. Dump the recording:

```shell
$ jcmd <pid> JFR.dump name=2 filename=memory-leak-recording.jfr
```

7. Use the `memory-leaks-by-site` view to find where the memory leak might be happening: 

```
$ jfr view memory-leaks-by-site memory-leak-recording.jfr
```

This time we get a much more useful response:

```
                                         Memory Leak Candidates by Site

Alloc. Time Application Method                                                             Object Age Heap Usage
----------- ------------------------------------------------------------------------------ ---------- ----------
20:48:41    org.apache.tomcat.util.net.NioChannel.read(ByteBuffer)                             16.5 s    61.8 MB
20:48:44    org.springframework.samples.petclinic.vet.VetController.showResourcesVetList()     12.7 s    64.3 MB
20:48:45    org.apache.catalina.core.StandardServer.await()                                    12.0 s    66.0 MB
20:48:49    N/A                                                                                8.31 s    69.8 MB
20:48:53    org.springframework.samples.petclinic.vet.Vets.getVetList()                        4.42 s    71.9 MB
20:48:53    org.apache.tomcat.util.net.NioEndpoint.serverSocketAccept()                        4.04 s    71.9 MB
```

This provides us with two locations in the petclinic app that might have a memory leak. Review the code locations for the issue, hint it's super obvious. 🙂

8. The memory-leak detection behavior isn't enabled by default because it has a non-trivial overhead. Now that we know what fix we need to make, we can disable that JFR behavior, _while keeping our default recording going_, using `jcmd`:

```
$ jcmd <pid> JFR.stop name=2
```

Next step is to [create custom JFR events](../C_create_custom_events/README.md)!

## **Tips for Managing and Analyzing JFR in Real World Use Cases**

### Naming and Sizing JFR Recordings

Make sure to provide a description name for your recording. Most likely you will want to include the name of your application inthe recording, if you are running multiple instances of a recording, you want to pass in some environmental identifier. If you include `%p` in the file name, the JVMs PID will be included in the name of the JFR recording. If you include `%t` a timestamp will be be included in the name of the JFR recording. 

By default JFR will endlessly collect data in a single JFR recording file. This is fine in our trivial proof-of-concept examples in this hands-on lab or when performing load testing. This however would not be good if you are persistently using JFR in a production setting. When configuring JFR, likely using the JVM argument `-XX:StartFlightRecording`, consider using the `maxage` and `maxsize` options. For `maxage` the modifiers are `s`, `m`, `h`, and `d`, for seconds, minutes, hours, and days, respectively. For `maxsize` the modifiers are `[m|M]` and `[g|G]` for megabytes and gigabytes respectively. On hitting these limits, JFR will automatically dump the recording. The settings of those values will depend upon your specific needs.

### Backward Compatibility

JFR provides top-notch backward compatibility support. While some of the tools we have demonstrated in this lab are relatively recent additions, like `jfr view` being added in JDK 21, they can be used to analyze JFR recording capture on older versions of the JDK. Still on JDK 8 in production at work? Not a problem, you can still use `jfr view` and other more recent additions to analyze JFR recordings. 

### JFR in Containers and on the Cloud

When using JFR on a JVM that is running in a container, as is the common practice these days, it's important that the JFR file is not being written to that container. If this happens, you risk losing your JFR recording file when you shutdown your container which might happening automatically when it's encountering an issue, and those are the JFR files you need the most! Instead you should attach a volume to your container and command JFR to dump its recordings to the location of the volume.    