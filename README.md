JFR Lab
============================

## Introduction

The JDK Flight Recorder (JFR) records events from the JVM, the JDK, and applications, providing a unified way to observe and debug the entire software stack. 
JFR is part of the JVM, has low overhead (<1% in typical use cases), and can correlate events across different layers and components.

This lab explores how to monitor and optimize Java applications with JFR. These lessons are divided into individual and independent modules:

1. Use JDK Flight Recorder (JFR) to capture data that helps you understand your application behavior - [A\_setup\_jfr](A_setup_jfr)
2. Manage and analyze JFR recordings - [B\_manage\_recordings](B_manage_recordings)
3. Writing and adding custom JFR events to your application - [C\_create\_custom\_events](C_create_custom_events)
4. Integrate JFR with Prometheus to correlate application and infrastructure behavior - [D\_consume\_events](D_consume_events)
5. Use JFR events in unit tests - [E\_unit\_tests](E_unit_tests)

## Prerequisites

* A minimum of JDK 25 is required. If you do not have Java 25 installed, you can obtain it from [https://jdk.java.net/25/](https://jdk.java.net/25/) and follow the JDK setup steps here: [https://dev.java/learn/getting-started/#setting-up-jdk](https://dev.java/learn/getting-started/#setting-up-jdk). Verify your Java version by running:

```shell
java -version 
```

* Maven installed on your computer. Check that you have installed maven by running the following command in a terminal window:

```shell
mvn -version 
```

Verified with version 3.9.9, but earlier versions should work.

* Use your favorite IDE (like [IntelliJ](https://dev.java/learn/intellij-idea/) or [Eclipse](https://dev.java/learn/eclipse/)) or a code editor like [VS Code](https://dev.java/learn/vscode-java/).

* Docker CLI running on your machine. Check that by running the following command in a terminal window:

```shell
docker version 
```

Verified with version 28.3.3-rd, but earlier versions should work.

* An optional tool is [JDK Mission Control](https://www.oracle.com/java/technologies/javase/products-jmc9-downloads.html).

## Working on the Lab

Start by cloning the code from this repo:

```shell
git clone https://github.com/java/j126-hol-jfr
```

You will work with a lightly modified version of the [Spring PetClinic](https://github.com/spring-projects/spring-petclinic) application, cloned inside the [spring-petclinic](spring-petclinic) folder. In a terminal window, place yourself inside the [spring-petclinic](spring-petclinic) folder and run the following command:

```shell
mvn clean verify 
```

You should get build success for spring-petclinic

You are now ready to work on the modules. Each module contains its own `README.md` with the instructions and hints. The modules are independent, so you can choose the one you want to work on, but we recommend to start with [A\_setup\_jfr](A_setup_jfr).

