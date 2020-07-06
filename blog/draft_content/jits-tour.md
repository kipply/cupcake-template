+++
title = "How JIT Compilers are Implemented and Fast: Julia, Pypy, LuaJIT, Graal and More"
date = 2020-07-14
+++

Hi! Welcome to my 4-part tour of JIT compilers. 

My mentor, [Chris](https://chrisseaton.com/), who took me from “what is a JIT” to where I am now once told me that compilers were just bytes in bytes out and not at all low-level and scary. This is actually fairly true, and it's fun to learn about compiler internals and occasionally useful (I recently applied some knowledge on GCs to increase performance of what was a 200GB RAM process).

This tour will give fairly strong insight into how JITs are implemented and will look at some tools that would be used by language engineers to analyze their work! Part 1 is less about JITs and more about how languages are implemented (though it’ll describe what a JIT does). Throughout the posts I go into details of 5+ JITs and various optimization strategies and discuss how they work with different JITs. The content is very much created to be depth-first, thus there are many important concepts that may be skipped.

*Mild Disclaimers, can be skipped*. I will often describe an optimization behaviour, and claim that it probably exists in some specific other compiler. I don't bother to check if an optimization exists in another JIT, I'll always state explicitly if I know its there. I will also provide code to show where an optimization might occur, though the optimization may not necessarily occur for that code because another optimization will take precedence. 

[Part 1: JITs are not very Just-in-Time]
*Gives overview on how programming languages are implemented, goes into Julia implementation (which is a JIT™). Covers what a JIT is and what the general approach is*. 

[Part 2: (Meta)tracing and Compiler-compilers]
*Talks about implementation of tracing JITs and meta-tracing JITs, brings warmup into consideration*. 

[Part 3: Nice allocation you got there, would not be a shame if something happened to it]
*Introduces how Pypy, LuaJIT and V8 eliminate allocations in three different ways.* 

[Part 4: The Unexpectedly Great JIT Compiler Strategies (long)]
*Introduces GraalVM and Hotspot. Tiering, Seas of Nodes, deoptimization and inlining.* 

# Part 1: Jits are not very Just-in-Time

### Programming Language Implementations

When we run a program, it’s either interpreted or compiled in some way. The compiler/interpreter is sometimes referred to as the "implementation" of a language, and one language can have many implementations. If I were to say "Python is interpreted", I really mean that the reference (standard/default) implementation of Python is an interpreter.

An interpreter is a program that directly executes your code. The interpreter is usually written in a lower-level language, such as C (Ruby and Python for example, are written in C). Below is a function that loosely models how an interpreter might work:

```go
func interpret(string code) {
  if code == "print('Hello, World!')" {
    print("Hello, World");
  }
}
```

A compiler is a program that translates code from some language to another language. Examples of compiled languages are C, Go and Rust.

```go
func compile(string code) {
  byte[] compiled_code = get_machine_code(code);
  write_to_executable(compiled_code);
}
```

The difference between a compiled and interpreted language is actually much more nuanced. C, Go and Rust are clearly compiled, as they output a machine code file - which can be understood natively by the computer. PHP is a fully interpreted language.

However, compilers can translate to any target language. Java for example, has a two-step implementation. The first is compiling Java source to bytecode, which is an Intermediate Representation (IR). The bytecode is then JIT compiled - which involves interpretation. 

Python and Ruby also executes in two steps. Despite being known as interpreted languages, their reference implementations actually compile the source down to a bytecode. You may have seen .pyc files (not anymore in Python3) which contain Python bytecode! The bytecode is then interpreted by a virtual machine.

Another important note is that interpreted languages are typically slower for various reasons, though the most obvious being that they're written in another (compiled) language that has overhead execution time. People still choose to build interpreted languages because they're easier to build, especially for features such as dynamic typing, scoping and automatic memory management.

### So What is a JIT? 

A JIT compiler doesn't compile code Ahead-Of-Time (AOT), but still compiles source code to machine code. JITs compile code at runtime, while your program is executing. This gives the JITs flexibility for dynamic language features, while maintaining speed from optimized machine code output. JIT-compiling C would make it slower as we'd just be adding the compilation time to the execution time. JIT-compiling Python would be fast, as executing machine code + compilation is still faster than interpreting, especially since the JIT has no need to write to a file. JITs also improve in speed by being able to optimize on information that is only available at runtime. 

### Julia, a lazy, elegant JIT

A common theme between compiled languages is that they're statically typed. That means when you create or use a value, you tell the computer what type it is and it can be guaranteed at compile time.

Julia is dynamically typed, not conventionally compiled, so it does fit that theme. Internally, however, Julia is much closer to being statically typed.

```julia
function multiply(x, y)
  x * y
end
```

Here is an example of a Julia function, which could be used to multiply integers, floats, vectors, etc (Julia allows operator overloading, and you can even use the `*` operator on strings). Compiling out the machine code for *all* these cases is not very productive for a variety of reasons, which is what we'd have to do if we wanted Julia to be a compiled language. Idiomatic programming means that the function will probably only be used by a few combinations of types and we don't want to compile something that we don't use yet since that's not very jitty (this is not a real term, YET). 

If I were to code `multiply(1, 2)`, then Julia will compile a function that multiplies integers. If I then wrote multiply(2, 3), then the pre-compiled code will be used. If I then added `multiply(1.4, 4)`, another version of the function will be compiled. We can observe what the compilation does with `@code_llvm multiply(1, 1)`, which generates LLVM Bitcode (not quite machine code, but a representative Intermediate Representation).

```haskell
define i64 @julia_multiply_17232(i64, i64) {
top:
; ┌ @ int.jl:54 within `*'
   %2 = mul i64 %1, %0
; └
  ret i64 %2
}
```

And with `multiply(1.4, 4)`, you can see how complicated it can get to compile even one more function;

```haskell
define double @julia_multiply_17042(double, i64) {
top:
; ┌ @ promotion.jl:312 within `*'
; │┌ @ promotion.jl:282 within `promote'
; ││┌ @ promotion.jl:259 within `_promote'
; │││┌ @ number.jl:7 within `convert'
; ││││┌ @ float.jl:60 within `Float64'
       %2 = sitofp i64 %1 to double
; │└└└└
; │ @ promotion.jl:312 within `*' @ float.jl:405
   %3 = fmul double %2, %0
; └
  ret double %3
}
```

This strategy is called *type inferencing*, which is used by many JITs but not to the explicitness that Julia does. There are a lot of other compiler optimizations that are made, though none of them are very specific to JITs as Julia may be better described as a lazy AOT compiler. 

The simplicity of this kind of jitting makes it easy for Julia to also supply AOT compilation. It also helps Julia to benchmark very well, definitely a tier above languages like Python and comparable to C (I'd cite numbers, but those are always nuanced and I don't want to get into that).

### So What is a JIT? Take Two. 

Julia is actually the jittiest JIT, but not as interesting as a "JIT". It actually compiles code right before the code needs to be used -- just in time. Most JITs however (Pypy, Java, JS), are not actually about compiling code just-in-time, but compiling _optimal code_ at an optimal time. In some cases that time is actually never. In other cases, compilation occurs more than once. In a vast majority of the cases compilation doesn't occur until after the source code has been executed numerous times, and the JIT will stay in the interpreter as the overhead to compilation is too high to be valuable. 

![](/Users/kipply/code/personal_site/blog/source/_drafts/jitbrr.png)

The other aspect at play is generating _optimal code_. Assembly instructions are not created equal, and compilers will put a lot of effort into generating the most optimized machine code. Usually, it is possible for a human to write better assembly than a compiler (though it would take a fairly smart and knowledgeable human), because the compiler cannot dynamically analyze your code. By that, I mean things like knowing the possible range of your integers or possibilities of `null` values, as these are things that a computer could only know after executing your program. A JIT compiler can actually do those things because it interprets your code first and gathers data from the execution. Thus, JITs are expensive in that they interpret, and add compilation time to execution time, but they make it up in highly optimised compiled code. With that, the timing of compilation is also dependent on whether the JIT has gathered enough valuable information. 

The cool part about JITs is that I was sort of lying when I said C could not be faster as a JIT. It still would not be feasible to try, but jit-compiling C in the way I just described is not a strict superset of compiling a language and thus it is not logically impossible to compile code fast enough to make up for the compile+profile+interpreting time. If I "JIT compiled" C similarly to how Julia does it (statically compile each function as it's called), it would be impossible to make it faster than compiled-C as the compile-time is non-negative and the generated machine code is essentially the same. 

# Part 2: (Meta)tracing and Compiler-compilers

LuaJIT employs a method called tracing. Pypy does meta-tracing, which involves using a system to generate tracing interpreters and JITs. This allows the generated JIT to also be adapted to the execution of the program. 

LuaJIT is not the reference or default implementation of Lua, but a project on it's own. I would describe LuaJIT as shockingly fast, and it describes itself as one of the fastest dynamic language implementations -- which I buy fully. The same goes for Pypy, for which the reference implementation is CPython. Tracing brings JITs more distinction from AOT, by using an interpreter along with a JIT compiler. 

To determine when it's more optimal to interpret code rather than compile it, the compiler will profile for information on loops. At some point, the compiler will decide to "trace" the loop, recording executed operations to produce very well optimized machine code. In the scope of tracing, the compiler profiles to look for "hot" loops to trace (the concept of “hot code” is used in other JITs!). Some examples  of resulting optimizations include dynamic dead-code removal, type inferencing and escape analysis.

### **How Pypy Implements Tracing**

Pypy will start tracing a function after 1619 executions, and will compile it/consider it hot after another 1039 executions, meaning a function has to execute at around 3000 times for it to start gaining speed.

Dynamic languages make it hard to optimize things away. The following code could be eliminated by a stricter language, as `false` will always be falsy. However, in Python 2, that could not have been guaranteed. 

```python
if False: 
  print("FALSE")
```

For any sane program, the conditional will always be true. Unfortunately, the value of `False` could be reassigned and thus if the statement were in a loop, it could be redefined somewhere else. For this case, Pypy would build a "guard". When a guard fails, the JIT will fall back to the interpreting loop. Pypy then uses another constant (200), called *trace eagerness* to decide whether to compile the rest of the path till the end of the loop. That sub-path is called a *bridge*.

Pypy also exposes all those constants as arguments that can be tweaked at execution, along with configuration for unrolling (expanding loops) and inlining. It also exposes some hooks so we can see when things are compiled!

```python
def print_compiler_info(i):
  print(i.type)
pypyjit.set_compile_hook(print_compiler_info)

for i in range(10000):
  if False:
    pass

print(pypyjit.get_stats_snapshot().counters)
```

Above, I set up a plain python program with a compile hook to print the type of compilation made. It also prints some data at the end, where I can see the number of guards. For the above I get one compilation of a loop and 66 guards. When I replaced the if statement with just a pass under the for-loop, I was left with 59 guards.

```python
if random.randint(1, 100) < 20:
  False = True
```

With those two lines added to the for loop, I got two compilations, with the new one being of type 'bridge'!

### Wait, but you said Meta-tracing!

The concept behind meta-tracing is “write an interpreter, get a compiler for free!” or more magically, “turn your interpreter into a compiler three easy steps!”. This is just obviously a great thing, since writing compilers is hard so if we can get a great compiler for free that’s just a good deal. Pypy "has" an interpreter and a compiler, but there’s no explicit implementation of a compiler. 

Pypy has a toolchain called RPython (which was built for Pypy). It is a framework program for implementing interpreters. It is a language in that it specifies a subset of the Python language, namely to force things like static typing. It is a language to write an interpreter in. It is not a language to code in typed-Python, since it doesn’t care have or care about things like standard libraries or packages. 

RPython programs are translated to optimized C, and any RPython program is a valid Python program. The translation to C is a part of the Pypy interpreter, but RPython adds another representation of the code, an optimising tracing JIT compiler. Boom, magic! 

Since interpreters are just giant loops iterating over instructions, detecting hot code is easy. Since RPython is a strict subset of Python that is also designed to produce optimized machine code that can be translated to C, the optimized machine code output also comes for free.

In short, there isn't a compiler and interpreter running alongside each other as it is in Hotspot. Rather, the compiler is less for the program you're trying to execute, but rather for compiling the optimizing interpreter! 

Metatracing might be confusing, so I wrote a very bad metatracing program that will only compile `a = 0; a++`to illustrate. 

```python
# interpreter written with RPython 
for line in code: 
  if line == "a = 0": 
    alloc(a, 0)
  elif line == "a++": 
    guard(a, "is_int") # notice how in Python, the type is unknown, but after being interpreted by RPython, the type is known
    guard(a, "> 0")
```

If I ran the following in a hot loop; 

```python
a = 0 
a++ 
a++
```

Then the traces may look something like; 

```python
# Trace from numerous logs of the hot loop
a = alloc(0)
a = int_add(a, 1)
a = int_add(a, 2)

# optimize trace to be compiled
a = alloc(2)
```

But the compiler isn't some special stand alone unit, it's built into the interpreter! So the interpreter loop would actually look something like this

```python
for line in code: 
  if traces.is_compiled(line): 
    run_compiled(traces.compiled(line))
    continue
  elif traces.is_optimized(line): 
    compile(traces.optimized(line))
  	continue
  elif line == "a = 0"
  # ....
```

### Warm it up

A theme that I haven't explicitly addressed is that JITs need to warmup. Because compile time and profiling time is expensive, JITs will start by executing a program slowly and then work towards "peak performance". For JITs with interpreted counterparts like Pypy, the JIT without warmup performs much worse at the beginning of execution.

![](/Users/kipply/code/personal_site/blog/source/_drafts/warmingup.png)

Warmup adds complexity to measuring efficiency of a programming language! It's fine if you're measuring the performance of generating the mandelbrot set, but becomes painful if you're serving a web application and the first N requests are painfully slow. It’s complicated by the fact that the performance doesn’t strictly increase. If Pypy decides it needs to compile many bridges all at once, then you might have a slow-down in the middle. It also makes most benchmarks you see questionable, as you have to check if the jitted languages were given time to warmup, but you’d also want to know if it took an unseemly amount of time to warmup. Optimizing your compiled code *and* warmup speed is unfortunately zero-sum(or at least small-sum) by nature. If you try to get your code to compile sooner, less data will be available, the compiled code will not be as efficient and peak performance will be lower. Aiming for higher peak performance of course, often means higher profiling costs. 

Think about warmup time! Javascript engines have put really good care into it, but you may find that languages built for academic uses have monstrous warmup times in favour of snazzy peak performances.

# Part 3: Nice allocation you got there, would not be a shame if something happened to it

Allocation elimination is a fairly iconic JIT-optimization, as a compiled program can rarely make assumptions about where, if and how some allocated data will be used. Writing to registers is a few orders of magnitude faster than malloc-ing and eliminating allocations can save the garbage collector time, making allocation elimination really important to JITs. 

### Pypy Escape Analysis

Pypy does a few things to minimize allocs, such as minimizing *boxing*. Boxing is when a primitive is boxed into an object wrapper type, such as an int to Integer in Java. The strategy is used by compilers to standardize data to be treated like objects and is very commonly done in dynamic languages. It is also quite an expensive operation as it bundles the value into a heap-structure, and involves unboxing at usage. Pypy considers this to be its second most important problem.

A part of the solution for boxing is called *virtualisation*. Instead of creating a new value, a virtual is created. While the virtual object is used within the limit of the scope (usually one iteration of a loop), nothing is allocated and read and writes are done through the virtual object. Additional computation is saved as since the virtual object exists, no guards need to exist for the value in the object, whereas a guard is usually in place to check the class after loading a value.

It is called *escape analysis* because it's checking for when values escapes a scope (a loop or a function). For example;

```python
x = 0
for i in range(10000): 
  # Integer.random() is not an actual stdlib operation in Python, I used it to indicate a non-primitive object is created 
  y = Integer.random() + x 
  x = x + y
print(x)
```

There are two cases of virtualisation here. The first is `y`, which will be virtualised. Thus in the second line of the loop, Pypy would no longer need a guard for the value of `y`.  ` x` on the other hand, does escape, but it's still valuable to virtualise it as that allocation is in a loop. Then, all the guards, allocations and read in the loop can be optimized away! When a jump instruction comes in (loop ends), it’ll come with code that actually allocates `x` for the garbage collector and future use. Another case of escape analysis can be found in methods; 

```python
def foo(): 
  x = {"A": 1, "B": 2} 
  return x["A"]
```

In this case, `x` will likely never escape and the allocation isn't even needed to execute the rest of the function. This particular case may actually be constant-folded away (the constant is replicated at usage sites), but abstractions of this pattern will use escape analysis. Most JITs work with boxing and escape analysis (Java, GraalVM) and it is not unique to Python. 

### LuaJIT Allocation Sinking

*To clear up possible confusion before I get to this, Allocation Sinking is not a distinct optimization from Escape Analysis. In fact, Allocation Sinking actually uses escape analysis, but does not operate on the information the way that Pypy does. It just so happens that LuaJIT has a specific name and Pypy (and others) just calls it "escape analysis".* 

Other allocation optimizations include avoiding the need for boxing in the first place (which LuaJIT does for floating points), and not allocating constants (as mentioned above in the context of constant-folding). LuaJIT's really impressive optimization is called *Allocation Sinking*. It's quite nice, and made a 3000+ word post on it's own. 

LuaJIT only has to do a store operation for temporary allocations through a method called store-to-load (compared to the usual additional load operation typically required). Often, an allocation will be done inside a loop but may not be used. LuaJIT doesn't try to bound the scope of an allocation, rather it focuses on moving allocations away from expensive paths (or removing them entirely). 

```lua
for i in range(1000):
  x = y + z
  a = i + x
```

This is not the most conventional code, but it's likely to come up especially in abstractions of similar patterns. What we want is for `x` to be declared outside of the loop, as it saves us that allocation every time we iterate. Say `y` had a value that was updated in the loop and `x` was used in a conditional in the loop, then it should be moved to be inside the conditional. The former is commonly known as "loop-invariant code motion" or "code motion", though the latter is called sinking (less common term, also includes sinking out of the loop). With store-to-load forwarding, LuaJIT defers the write and *forwards* the data to the read. As a result, the allocation and read is very much removed with the values living in registers. The data is low-levelly forwarded to the point of escape (if it exists) with the fancy store-to-load forwarding (not going to get into how allocations work, but it's fast!)

Most examples are much more complex and bring in more problems to deal with. LuaJIT implements them all™! Re-sinking occurs when multiple layers of sinking is possible. For Lua to decide when a sink is a valid optimization:

1. Check that one of four IR instructions is used. (Allocating a new table, copying a table, allocating mutable or immutable data) If it's used, then proceed with checking!
2. Pass through IR and mark unsinkable allocations. This is a single-pass propogate-back algorithm.
3. Pass through IR and sink the unmarked allocations.
4. The IR is compiled to machine code!

Mike Pall wrote up more insight into the implementation of this, which is pretty great! Other JITs try to do this as well, though there is some overlap in optimizations that are made through sinking and escape analysis that Pypy does. Another difference between Pypy and LuaJIT (and also Hotspot for example) is that Pypy has to box a lot more values, thus what's important to work on allocation-related optimizations differ. V8 implements escape analysis, but does allocation sinks through deoptimization (which I'll talk about later!) LuaJIT does do a really great job with allocation eliminations, including optimizations that more mature engines such as Hotspot is unable to make. 

#### Intermission to learn about the LLVM

A toolchain to consider is the LLVM, which provides a ton of tools related to compiler infrastructure. Julia works with LLVM (note that it’s a large toolchain and each language will utilize it differently), as well as Rust, Swift and Crystal. Suffice it to say that it’s a significant and amazing project that of course also supports JITs, yet there hasn’t really been any significant dynamic JITs built with the LLVM. JavaScriptCore’s fourth compiler tier (see more about tiering in Part 4) briefly used an LLVM backend but was replaced in less than two years. The LLVM hasn’t been well suited to dynamic JITs generally because it wasn’t made to work with the unique challenges of being dynamic. Pypy has tried about 5 or 6 times, but JSC actually went with it! With the LLVM, allocation sinking and code motion were limited. Powerful JIT features like range-inferencing (like type inference, but also knowing the range of a value) were not possible. Furthermore, the LLVM comes with very expensive compile times.

### V8 Allocation Folding 

With LuaJIT I introduced the concept of reducing the cost of allocation with store-to-load forwarding. V8 adds in something called allocation folding, which groups allocations (folds) them together to save some operations. Allocation folding was actually pioneered by the V8 team at Google and was released in 2014, so unlike Pypy's escape analysis optimizations and LuaJIT's sinking which are somewhat universal, allocation folding may be a V8-special!

When allocating, a common strategy is to use bump-pointer. It simply moves the pointer up by the size of the chunk and returns the pointer (after checking that there's enough space remaining). The goal of allocation folding is for the allocation group to be allocated with a single check + pointer move (plus some bonus things). It also improves the cost of write barriers, which are low-level operations that ensures the order of memory operations are persisted.

So in the following code; 

```javascript
var x = 3423
for (var i = 0; i < y; i++) {
  doSomethingThatDoesntInvolveX()
}
var y = 43543
```

The allocations of `x` and`y` would then be folded, with `y` being allocated early and instantiated later. Allocation folding is made to work well with write barrier elimination, for which many more cases are captured after use of allocation folding. 

Allocation folding is fairly effective! Below is a graph of a few handpicked benchmarks. AF = Allocation Folding and WBE = Write Barrier Elimination (WBE-AF is then Write Barrier Elimination and Allocation Folding). Improvments for WBE-AF range from 2-16%, which is pretty significant! But those were cherry-picked and benchmarks such as zlib and regexp actually ended up with wrse performance. The optimization enabled in V8 as it was concluded to be generally beneficial. 

The graph is pulled from *Allocation Folding Based on Dominance* (Clifford, H. Payer, M. Starzinger, and B. L. Titzer. 2014.), you can also reference the paper for experiment details. 

![image-20200620141914239](/Users/kipply/Library/Application Support/typora-user-images/image-20200620141914239.png)

# Part 4: The Unexpectedly Great JIT Compiler Strategies 

### A brief introduction to JVMs

Disclaimer: I worked on/with a Graal-based language, [TruffleRuby](https://github.com/oracle/truffleruby) for four months and loved it.

Hotspot (named after looking for _hot_ spots) is the VM that ships with standard installations of Java, and there are actually multiple compilers for it for a tiered strategy. Hotspot is open source, with 250,000 lines of code which contains the compilers, and three garbage collectors. It does an _awesome_ job at being a good JIT, there are some benchmarks that have Hotspot running faster than C++ (oh my gosh so many asterisks on this, you can Google to find all the debate). Strategies used in Hotspot inspired many of the subsequent JITs, the structure of language VMs and especially the development of Javascript engines. It also created a wave of JVM languages such as Scala, Kotlin or Jython (which is a Python implementation that compiles down to JVM bytecode, to be executed by Hotspot).

![](/Users/kipply/code/personal_site/blog/source/_drafts/vms.png)

GraalVM is a JavaVM and then some, written in Java. It can run any JVM language (Java, Scala, Kotlin, etc). It also supports a Native Image, to allow AOT compiled code through something called Substrate VM. Twitter runs a significant portion of their Scala services with Graal, so it must be pretty good, and better than the JVM despite being written in Java. But wait, there's more! GraalVM also provides Truffle, a framework for implementing languages through building Abstract Syntax Tree (AST) interpreters. With Truffle, there’s no explicit step where JVM bytecode is created as with a conventional JVM language, rather Truffle will just use the interpreter and communicate with the JVM to create machine code directly with profiling and a technique called partial evaluation. Partial evaluation is out of scope for this blog post, tl;dr it follows metatracing’s “write an interpreter, get a compiler for free” philosophy but is approached differently. 

### Stupid Idea #1: Interpreting C

A common problem with JIT implementations is support for C Extensions. Standard interpreters such as Lua, Python, Ruby, and PHP have a C API, which allows users to build packages in C, thus making the execution significantly faster. Common packages such as numpy or standard library functions such as `rand` for Ruby are written in C. C extension support is hard to support for a variety of reasons, the most obvious being that the API is modelled on internal implementation details. Pypy recently came out with beta support, though JRuby or Jython are out of luck. LuaJIT does support C extensions, along with additional features (LuaJIT is pretty darn great!)

Graal solves the problem with Sulong, an engine that runs LLVM Bitcode on GraalVM. The LLVM is a toolchain, though all we need to know about it is that C can be compiled into LLVM Bitcode (Julia also has an LLVM backend!). It's a bit weird, but basically the solution is to take a perfectly good 40+ year old compiled language and interpret it! Of course, it's not nearly as fast as properly compiling C, but there are a few wins tucked away in here.

![](/Users/kipply/code/personal_site/blog/source/_drafts/cextensions.png)

LLVM Bitcode is already fairly lowlevel, which means that interpreting that IR is not as inefficient as interpreting C. Some of that cost is earned back in that the Bitcode can be optimized along with the rest of the Ruby program, as JITs do! An extremely powerful optimization is again, eliminating temporary allocations as that's an optimization very unique to dynamic jitting. While interpreting is a few orders of magnitude slower than compiling, writing to registers is a few orders of magnitude faster than malloc-ing. Specific benchmarks can actually make TruffleRuby (a GraalVM implementation of Ruby) C extensions faster than CRuby C extensions.

The ability for Graal to work with Sulong is a part of their polyglot features, which provides high interoperability between languages. Not only is it great for the compiler, but it is also a proof of concept for multiple languages easily used in one "application".

### Stupid Idea #2: Deliberately back to the interpreted code, it'll be faster I promise

We know that JITs come with an interpreter and a compiler, and that they move from the interpreter to the compiler to get faster. Pypy set bridges to take the inverse path, though for Graal and Hotspot, they _deoptimize_. The terms do not refer to strictly different concepts, but deoptimization (also a term used by V8) refers more to transferring back to the interpreter as a deliberate optimization rather than as a solution to the inevitabilities of dynamic languages. Hotspot and Graal both leverage deoptimization aggressively -- Graal especially as engineers have heavy control over the compilation and need more control over the compilation for optimizations (compared to, say, Pypy). 

An important component to making deoptimization fast, is to make sure that switch from the compiler to interpreter is fast. The most naive implementation would result in the interpreter having to “catch up” with the compiler in order to be able to make the deopt. Additional complexity exists in dealing with deoptimizing asynchronous threads. To deoptimize, Graal will recreate the stack frames and use a mapping from generated code to return to the interpreter. For threads, safepoints in Java threads are used which are in place for threads to constantly pause and go “hi garbage collector, do I stop now?” so not much overhead is added to handle threads. It’s a bit rocky, but fast enough to make deoptimization a good strategy. 

![](/Users/kipply/code/personal_site/blog/source/_drafts/deopts.png)

As mentioned earlier, V8 implements allocation sinking as a deoptimization, probably by identifying redundancy after profiling and branching it away into a deoptimization. Similarly to the Pypy bridging example in part 2, monkey patching of functions can be deoptimized. The deoptimization there can be quite elegant, as it doesn’t have to be a guard to check if a function has been monkeypatched, rather the deoptimization is made when monkey patching occurs. 

A great example of a JIT deoptimization is conversion overflow, which is not a super-official term, but generally refers to when a particular type (say `int32`) is allocated internally but needs to become a `int64`. This is something that TruffleRuby does through deoptimizations, as well as V8. 

Say when you set `var = 0` in Ruby, you get an `int32` (Ruby actually calls it Fixnum and Bignum, but I’ll continue saying `int32` and `int64`). Whenever you do an operation on `var`, you would then have to check if the resulting value overflows. The check is one thing, however, compiling the code that handles the overflow is expensive, especially given how common numeric operations are. 

Even without looking at compiled instructions, we can see how this deoptimization eases the amount of code it takes to handle. 

```c
int a, b; 
int sum = a + b; 
if (overflowed) {
  long bigSum = a + b; 
  return bigSum;
} else {
  return sum; 
}

int a, b; 
int sum = a + b; 
if (overflowed) {
  Deoptimize!
}
```

For TruffleRuby on Graal, it’s written to only deoptimize the first time a _specific_ operation is run, so that the cost of the deopt isn’t spent every time should an operation consistently overflow. (I assume V8 does the same, but I'm only making statements for things I know for certain / have verified). 

### Stupid Idea #2.5: Wet code is fast code

```javascript
function foo(a, b) {
 return a + b;
}
for (var i = 0; i < 1000000; i++) {
 foo(i, i + 1);
}
foo(1, 2); 

```

In V8, even something as trivial as that triggers a deopt! With `--trace-deopt` and `--trace-opt` you can actually see most of these (there are also highly comprehensive tools for Graal, though I’ll be showing `node` since people likely already have it installed). 

It is the final line (`foo(1, 2)`) that triggers the deopt, which is puzzling because that exact call is made in the loop! The message is “Insufficient type feedback for call” (you can find a full list of deopt reasons at https://chromium.googlesource.com/v8/v8/+/roll/src/deoptimize-reason.h, which funnily includes a “no reason” reason). The output gives us an input frame which shows us the literals 1 and 2. 

So why the deoptimization? Maybe V8 doesn’t actually explicitly infer and understand that `i` is always an integer and that the literals passed in are also integers. 

I can confirm this by replacing that line with `foo(i, i +1)`, but I actually still get a deoptimization, though this time the message is “Insufficient type feedback for binary operation”. WHY I ASK WHY IT IS LITERALLY THE SAME OPERATION I RAN IN THE LOOP WITH THE SAME VARIABLES. 

The answer my friend, is ~~blowing in the wind~~ on-stack replacement (OSR). In earlier parts, I mentioned inlining as an optimization, where functions stop being functions and instead the contents are expanded at the call site. This is sometimes done statically, but more often done dynamically, in which OSR is involved so that the code used is changed at runtime. 

```
// partial output 

[compiling method 0x04a0439f3751 <JSFunction (sfi = 0x4a06ab56121)> using TurboFan OSR]
0x04a06ab561e9 <SharedFunctionInfo foo>: IsInlineable? true
Inlining small function(s) at call site #49:JSCall
```

So V8 will compile `foo` and determine it is inline-able which it does with OSR. However, it only performs this inlining within the loop as it’s not safe to make that assumption for non-hot code without `i` typed. Thus, V8 still does not have enough type feedback on the `+` operation. If I `--no-use-osr`, then the deoptimization don’t happen - whether or not I pass a literal or `i`, yet without the inlining even measly million iterations are noticeably slower. Building JITs is a huge land of tradeoffs! Deoptimizations are expensive but not nearly as much as the cost of method lookup and inlining is much preferred in this case. 

Inlining is crazy effective! I ran the code above with a couple extra zeroes, and it was 4 times slower with inlining disabled. 

![image-20200620214043455](/Users/kipply/Library/Application Support/typora-user-images/image-20200620214043455.png)

Though this is a blog post about JITs, inlining is also really effective for compiled languages. All LLVM languages will inline aggressively (because the LLVM will inline), though Julia actually inlines without the LLVM because of its jitty nature. JITs can inline with heuristics that come from runtime information, and can switch from not-inlining to inlining with OSR.

### Stupid Idea #3: What if instead of instruction based IR like everyone else we had a big graph, and also it modifies itself

We've taken a look at LLVM bitcode and Python/Ruby/Java-esque byte code as IR - and they share the same format of some kind of language that looks like instructions. Hotspot, Graal and V8 have an IR called "Sea of Nodes" (pioneered by Hotspot) which is essentially a lower level AST. One can imagine how Seas of Nodes are effective IR, as much of profiling work is dependent on a notion a certain path not being taken often (or being traversed in a particular pattern). Note that these compiler ASTs are distinct from the parser AST. 

I'm usually all for "try this at home!" but getting graphs to browse is actually a bit difficult, albeit lots of fun and often very helpful for understanding compiler flows. I for one, cannot read all the graphs not only by limits of knowledge but by the computation power (which can be mediated with compiler options to get rid of behaviours I don't care about)

![image-20200628223724340](/Users/kipply/Library/Application Support/typora-user-images/image-20200628223724340.png) For V8, you'll need to build V8 and then use the D8 tool with the flag `--print-ast`. For Graal, `--vm.Dgraal.Dump=Truffle:2`. These give you text outputs (formatted such that you can get a graph out of them). I'm not sure how V8 developers generate visual graphs but Oracle provides "Ideal Graph Visualizer", which is used above. I did not have the energy to reinstall IGV so instead I have graphs from Chris Seaton generated with Seafoam which is not currently open sourced. 

Anyway, let us look at a JavaScript AST!

{{TODO: INSERT JS AST STUFF, highlight JS AST with Rust because that looks the best somehow}}

{{TODO}}

### Stupid Idea #4: Yay, JIT compiled code! Let's compile it again! And again! 

I've been teasing "Tiering" since Part 1, so let's finally get a look into it! It is the simple concept that if we're not ready to create the most optimized code yet, but interpreting is still expensive, we can compile early once and then compile again when we're ready to generate more optimized code.

Hotspot is a tiering JIT, with two compilers; C1 and C2. The C1 compiler will kick in first and do a quick compile and run then run full profiling to get C2 compiled code. This can help clear up a lot of our concerns with warmup. Unoptimized compiled code is still faster than interpreting and getting that unoptimized compiled code is faster. Another fancy thing is that not all code will be compiled by C1 and C2. If a function is deemed trivial enough, it's very likely that optimized C2 output will not be helpful and no attempt has to be made (and profiling time is saved). If perhaps C1 is busy compiling, then the profiling can continue and skip C1 to be compiled by C2. directly. 

![](/Users/kipply/code/personal_site/blog/source/_drafts/hotspottiers.png)

JavaScript Core tiers even harder! In fact, it has _three JITs_. JSC's interpreter also does light profiling, then moves onto the Baseline JIT, then to the DFG (Data Flow Graph) JIT, and finally to the FTL (Faster than Light) JIT. With these tiers, the meaning of deoptimization is no longer limited to a compiler-to-interpreter path, but deoptimization can happen from the DFG to the Baseline JIT (this is likely also the case for Hotspot C2->C1). These deoptimizations and passes into the next tier are done through on-stack-replacement. 

The Baseline JIT kicks in by 100 executions and the he DFG JIT kicks in at about 1000 executions (with exceptions) which means that the JIT gets compiled code much more quickly than say Pypy (which took about 3000 executions). The tiering strategy enables the JIT to try to match the amount of time spent executing the code with the amount of time spent optimizing the code. There are a whole bunch more of handy tricks as to which kind of optimizations (inlining, type inferencing, etc) are done at which tier and why that's optimal!

## Related Readings

In vague order of how they're related to the blog post. 

- [Impact of Meta-tracing on VMs by Laurie Tratt](https://tratt.net/laurie/research/pubs/html/bolz_tratt__the_impact_of_metatracing_on_vm_design_and_implementation/)

- [Pypy Escape Analysis](https://morepypy.blogspot.com/2010/09/escape-analysis-in-pypys-jit.html)

- [LuaJIT Allocation Sinking](http://wiki.luajit.org/Allocation-Sinking-Optimization)

- [Why Users aren't More Happy with VMs by Laurie Tratt](https://tratt.net/laurie/blog/entries/why_arent_more_users_more_happy_with_our_vms_part_1.html)

- [V8 Allocation Folding Paper](https://static.googleusercontent.com/media/research.google.com/en//pubs/archive/42478.pdf)

- Things About JS Engines

  - [List of V8 Compiler Options](https://flaviocopes.com/node-runtime-v8-options/)
  - [JSCore Replacing their LLVM Backend for a "Faster Than Light" JIT](https://webkit.org/blog/3362/introducing-the-webkit-ftl-jit/)

- Things about Deoptimizations

  - [Deoptimizing TruffleRuby Lazy Initialization by me](https://engineering.shopify.com/blogs/engineering/optimizing-ruby-lazy-initialization-in-truffleruby-with-deoptimization)  
  - [Deoptimizing Ruby by Chris Seaton](https://chrisseaton.com/truffleruby/deoptimizing/)
  - [V8 Lazy Deopts](https://v8.dev/blog/lazy-unlinking)

- Things About Graal

  - [High Performance C Extensions by Chris Seaton](https://chrisseaton.com/truffleruby/cext/)
  - [Understanding Graal Graphs by Chris Seaton](https://chrisseaton.com/truffleruby/basic-graal-graphs/)
  - [Top 10 Things to do with GraalVM by Chris Seaton](https://chrisseaton.com/truffleruby/tenthings/)

- Things about Partial Evaluation 

  - [Partial Evaluation vs Meta-tracing](https://stefan-marr.de/papers/oopsla-marr-ducasse-meta-tracing-vs-partial-evaluation/)
  - [Paper that introduces partial evaluation for Graal](https://chrisseaton.com/rubytruffle/pldi17-truffle/pldi17-truffle.pdf)

- Misc

  - [How Garbage Collectors Work, from the Crafting Interpreters Book](http://craftinginterpreters.com/garbage-collection.html)

  - [Benchmarking correctly is hard by Julia Evans](https://jvns.ca/blog/2016/07/23/rigorous-benchmarking-in-reasonable-time/)

    
